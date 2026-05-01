import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Readable } from 'node:stream';
import type { AuthUser } from '../auth/auth-user';
import { ContactsRepository } from '../contacts/contacts.repository';
import { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import type { Envelope, EnvelopeEvent, EnvelopeSigner } from '../envelopes/envelope.entity';
import { TemplatesRepository } from '../templates/templates.repository';
import { IdempotencyRepository } from './idempotency.repository';
import { SupabaseAdminClient, SupabaseAdminError } from './supabase-admin.client';

/**
 * Hard cap on how many envelopes the inline streaming export will emit.
 * Above this we serve a stub payload that points the caller at the
 * (not-yet-built) async-job pivot — see issue #45 follow-up. 100k * a
 * few KB per envelope keeps a single inline export under ~1 GB on the
 * wire, which the browser can hold but still completes in minutes.
 */
const EXPORT_INLINE_ENVELOPE_CAP = 100_000;

/**
 * Page size for streaming envelope hydration. Each batch is the unit of
 * peak memory — at 500 envelopes * ~10 KB hydrated each that's ~5 MB
 * resident, which fits comfortably even on the smallest worker
 * instance. Lower means more round-trips; higher means more peak heap.
 */
const EXPORT_STREAM_BATCH_SIZE = 500;

/**
 * Wire format of the GDPR / CCPA / DSAR data export. Public surface
 * lives in this comment + the type definition because the JSON file is
 * downloaded by users and consumed by their tooling — the shape is
 * effectively a contract.
 */
export interface AccountExport {
  readonly meta: {
    readonly format_version: '1.0';
    readonly generated_at: string;
    readonly user: { readonly id: string; readonly email: string | null };
    readonly counts: {
      readonly contacts: number;
      readonly envelopes: number;
      readonly templates: number;
      readonly outbound_emails: number;
    };
    readonly includes_files: false;
  };
  readonly contacts: ReadonlyArray<unknown>;
  readonly templates: ReadonlyArray<unknown>;
  readonly envelopes: ReadonlyArray<{
    readonly envelope: Envelope;
    readonly signers: ReadonlyArray<EnvelopeSigner>;
    readonly events: ReadonlyArray<EnvelopeEvent>;
    readonly outbound_emails: ReadonlyArray<unknown>;
  }>;
}

/**
 * Wire shape for the streaming variant. Identical to `AccountExport`
 * apart from two fields we can only know at end-of-stream:
 * `meta_tail.outbound_emails` (the cumulative count) and `warnings[]`
 * (any envelopes that disappeared mid-flight or any cap-truncation
 * notice). Clients reconcile by reading both `meta.counts.outbound_emails`
 * (which will be `null` in the streamed form) and `meta_tail`.
 */
export interface AccountExportStreamed extends Omit<AccountExport, 'meta'> {
  readonly meta: Omit<AccountExport['meta'], 'counts'> & {
    readonly counts: Omit<AccountExport['meta']['counts'], 'outbound_emails'> & {
      readonly outbound_emails: number | null;
    };
  };
  readonly meta_tail: { readonly outbound_emails: number };
  readonly warnings: ReadonlyArray<{ readonly code: string; readonly detail: string }>;
}

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    private readonly contactsRepo: ContactsRepository,
    private readonly envelopesRepo: EnvelopesRepository,
    private readonly templatesRepo: TemplatesRepository,
    private readonly outboundEmailsRepo: OutboundEmailsRepository,
    private readonly idempotencyRepo: IdempotencyRepository,
    private readonly supabaseAdmin: SupabaseAdminClient,
  ) {}

  /**
   * T-19 — assemble an export of every row owned by the caller as an
   * in-memory `AccountExport`. Useful for unit tests and small accounts
   * where the wire shape needs to be inspected as a single object. For
   * the controller path use `exportAllStream` instead — it bounds peak
   * memory to one batch (issue #45).
   */
  async exportAll(user: AuthUser): Promise<AccountExport> {
    const [contacts, templates, envelopeIds] = await Promise.all([
      this.contactsRepo.findAllByOwner(user.id),
      this.templatesRepo.findAllByOwner(user.id),
      this.collectEnvelopeIds(user.id),
    ]);

    // For each envelope id, hydrate the full aggregate + events +
    // outbound emails in parallel. Order doesn't matter — the consumer
    // sorts on its end. We bound concurrency by `Promise.all` over the
    // outer list, which is small (envelopeIds is the user's lifetime
    // count). If that ever gets large, batch with a semaphore.
    const envelopes = await Promise.all(
      envelopeIds.map(async (envelopeId) => {
        const [aggregate, events, outboundEmails] = await Promise.all([
          this.envelopesRepo.findByIdWithAll(envelopeId),
          this.envelopesRepo.listEventsForEnvelope(envelopeId),
          this.outboundEmailsRepo.listByEnvelope(envelopeId),
        ]);
        // Defensive: an envelope id surfaced by `listByOwner` should
        // always resolve to a row; if a concurrent delete races, skip
        // it rather than blow up the whole export.
        if (!aggregate) {
          this.logger.warn(`export: envelope ${envelopeId} disappeared mid-flight; skipping`);
          return null;
        }
        return {
          envelope: aggregate,
          signers: aggregate.signers,
          events,
          outbound_emails: outboundEmails,
        };
      }),
    );

    const cleanEnvelopes = envelopes.filter((e): e is NonNullable<typeof e> => e !== null);
    const outboundEmailCount = cleanEnvelopes.reduce((n, e) => n + e.outbound_emails.length, 0);

    return {
      meta: {
        format_version: '1.0',
        generated_at: new Date().toISOString(),
        user: { id: user.id, email: user.email },
        counts: {
          contacts: contacts.length,
          envelopes: cleanEnvelopes.length,
          templates: templates.length,
          outbound_emails: outboundEmailCount,
        },
        includes_files: false,
      },
      contacts,
      templates,
      envelopes: cleanEnvelopes,
    };
  }

  /**
   * T-19 streaming variant (issue #45). Returns a `Readable` that emits
   * a single valid JSON document of the same `AccountExport` shape as
   * `exportAll`, but hydrates envelopes in batches of
   * `EXPORT_STREAM_BATCH_SIZE` instead of all-at-once. Peak heap is
   * bounded by one batch (~5 MB at default settings), regardless of how
   * many envelopes the caller owns.
   *
   * Above `EXPORT_INLINE_ENVELOPE_CAP` envelopes we still emit a valid
   * JSON document but truncate the `envelopes` array and surface a
   * `meta.warnings[]` entry explaining the cap. A future PR will pivot
   * those callers to an async-job export emailed to them.
   *
   * Wire shape (key order is fixed for a stable contract):
   *   { "meta": {...}, "contacts": [...], "templates": [...],
   *     "envelopes": [ {...}, {...}, ... ] }
   *
   * `meta.counts` is computed before emission so it sits at the top of
   * the document; `meta.warnings` is emitted last because warnings are
   * accumulated during the stream walk (e.g. an envelope that races a
   * delete after its id was listed).
   */
  async exportAllStream(user: AuthUser): Promise<Readable> {
    const [contacts, templates, envelopeIds] = await Promise.all([
      this.contactsRepo.findAllByOwner(user.id),
      this.templatesRepo.findAllByOwner(user.id),
      this.collectEnvelopeIds(user.id),
    ]);

    const truncated = envelopeIds.length > EXPORT_INLINE_ENVELOPE_CAP;
    const inlineIds = truncated ? envelopeIds.slice(0, EXPORT_INLINE_ENVELOPE_CAP) : envelopeIds;
    const warnings: Array<{ readonly code: string; readonly detail: string }> = [];
    if (truncated) {
      warnings.push({
        code: 'envelope_cap_exceeded',
        detail: `Inline export capped at ${EXPORT_INLINE_ENVELOPE_CAP} envelopes; ${envelopeIds.length - EXPORT_INLINE_ENVELOPE_CAP} omitted. Contact support for an async export.`,
      });
    }

    // We don't know `outbound_emails` count until each envelope is
    // hydrated. Stream the meta-counts using the inline-envelope length
    // and a `null` outbound-emails count (clients infer from the
    // envelopes array). This keeps the document streamable without a
    // second pass over the DB.
    const meta = {
      format_version: '1.0' as const,
      generated_at: new Date().toISOString(),
      user: { id: user.id, email: user.email },
      counts: {
        contacts: contacts.length,
        envelopes: inlineIds.length,
        templates: templates.length,
        // Filled in at the end of the stream — emitted in `meta_tail`.
        outbound_emails: null as number | null,
      },
      includes_files: false as const,
    };

    const repo = this.envelopesRepo;
    const outRepo = this.outboundEmailsRepo;
    const logger = this.logger;
    let outboundEmailCount = 0;

    // We use an async generator + Readable.from so backpressure is
    // honored: when the response socket fills, the generator pauses
    // automatically.
    async function* generate(): AsyncGenerator<string, void, unknown> {
      yield '{';
      yield `"meta":${JSON.stringify(meta)},`;
      yield `"contacts":${JSON.stringify(contacts)},`;
      yield `"templates":${JSON.stringify(templates)},`;
      yield '"envelopes":[';

      let first = true;
      for (let offset = 0; offset < inlineIds.length; offset += EXPORT_STREAM_BATCH_SIZE) {
        const batch = inlineIds.slice(offset, offset + EXPORT_STREAM_BATCH_SIZE);
        // Hydrate the batch in parallel — bounded by batch size, not
        // total envelopes, so peak memory stays flat.
        const hydrated = await Promise.all(
          batch.map(async (envelopeId) => {
            const [aggregate, events, outboundEmails] = await Promise.all([
              repo.findByIdWithAll(envelopeId),
              repo.listEventsForEnvelope(envelopeId),
              outRepo.listByEnvelope(envelopeId),
            ]);
            if (!aggregate) {
              logger.warn(`export: envelope ${envelopeId} disappeared mid-flight; skipping`);
              warnings.push({
                code: 'envelope_disappeared',
                detail: `envelope ${envelopeId} was deleted between id-listing and hydration`,
              });
              return null;
            }
            return {
              envelope: aggregate,
              signers: aggregate.signers,
              events,
              outbound_emails: outboundEmails,
            };
          }),
        );
        for (const item of hydrated) {
          if (item === null) continue;
          outboundEmailCount += item.outbound_emails.length;
          yield (first ? '' : ',') + JSON.stringify(item);
          first = false;
        }
      }

      yield '],';
      // Tail meta — outbound_emails count is now known. Clients
      // tolerant to the null sentinel get the final value here.
      yield `"meta_tail":${JSON.stringify({ outbound_emails: outboundEmailCount })},`;
      yield `"warnings":${JSON.stringify(warnings)}`;
      yield '}';
    }

    return Readable.from(generate());
  }

  /**
   * T-20 — wipe non-cascading rows then ask Supabase to delete the
   * `auth.users` row, which triggers cascade deletion of every
   * `owner_id` FK (contacts, envelopes & children, templates,
   * outbound_emails).
   *
   * Order: idempotency_records FIRST, admin call SECOND. If the admin
   * call fails the user retries; the idempotency wipe is safely
   * idempotent. Doing it the other way around would leave orphan
   * records the user could no longer reach via the auth system.
   */
  async deleteAccount(user: AuthUser): Promise<void> {
    const wiped = await this.idempotencyRepo.deleteByUser(user.id);
    this.logger.log(`account-delete: idempotency_records wiped=${wiped} user=${user.id}`);
    try {
      await this.supabaseAdmin.deleteUser(user.id);
    } catch (err) {
      if (err instanceof SupabaseAdminError) {
        this.logger.error(
          `account-delete: supabase admin failed for user=${user.id}: ${err.message}`,
        );
        throw new ServiceUnavailableException('admin_api_unavailable');
      }
      throw err;
    }
    this.logger.log(`account-delete: complete user=${user.id}`);
  }

  /**
   * Walk every page of the owner's envelopes and return the id list.
   * Uses the existing `listByOwner` cursor pagination + the repo's own
   * `decodeCursorOrThrow` so we never need to know the on-the-wire
   * cursor format (it differs between adapters: PG uses base64, the
   * in-memory test fixture uses base64url, both pipe-delimited). The
   * page size is the maximum the port accepts (100).
   */
  private async collectEnvelopeIds(ownerId: string): Promise<ReadonlyArray<string>> {
    const ids: string[] = [];
    let cursor: { updated_at: string; id: string } | null = null;
    // Hard upper bound to keep tests deterministic and detect misuse if
    // a future bug returns a non-advancing cursor.
    for (let i = 0; i < 1000; i++) {
      const page = await this.envelopesRepo.listByOwner(ownerId, {
        limit: 100,
        cursor,
      });
      for (const item of page.items) ids.push(item.id);
      if (!page.next_cursor) return ids;
      try {
        cursor = this.envelopesRepo.decodeCursorOrThrow(page.next_cursor);
      } catch {
        // Defensive — if the cursor is unparseable (a future format
        // change without rev'ing this caller) stop paging cleanly
        // rather than crash the whole export.
        this.logger.warn(`export: stopping pagination — undecodable cursor for owner=${ownerId}`);
        return ids;
      }
    }
    this.logger.warn(`export: hit envelope-page hard cap for owner=${ownerId}`);
    return ids;
  }
}
