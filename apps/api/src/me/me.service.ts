import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { AuthUser } from '../auth/auth-user';
import { ContactsRepository } from '../contacts/contacts.repository';
import { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import type { Envelope, EnvelopeEvent, EnvelopeSigner } from '../envelopes/envelope.entity';
import { StorageService } from '../storage/storage.service';
import { TemplatesRepository } from '../templates/templates.repository';
import { IdempotencyRepository } from './idempotency.repository';
import { SupabaseAdminClient, SupabaseAdminError } from './supabase-admin.client';
import { TombstonesRepository } from './tombstones.repository';

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
 * Issue #46 — TTL on every signed Storage URL we attach to the export.
 * One hour is long enough for a user to download every artifact in a
 * single sitting (an export with thousands of envelopes might run a
 * `wget --recursive` for many minutes), short enough that the URL
 * effectively expires before the user could share it. The Supabase REST
 * `/object/sign` endpoint accepts seconds.
 */
const EXPORT_SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Wire shape of the per-envelope `files` block in the export. Each key
 * is `null` when either (a) the artifact does not exist (e.g. the
 * envelope is a draft so there is no sealed PDF yet) or (b) the storage
 * call failed — in case (b) a corresponding entry is appended to
 * `warnings[]` so the consumer knows to retry.
 */
export interface EnvelopeExportFiles {
  readonly original_pdf_url: string | null;
  readonly sealed_pdf_url: string | null;
  readonly audit_pdf_url: string | null;
  readonly signers: ReadonlyArray<{
    readonly signer_id: string;
    readonly signature_image_url: string | null;
    readonly initials_image_url: string | null;
  }>;
}

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
    // Issue #46 — true once the export attaches short-TTL signed URLs
    // for every storage object alongside the row data. Consumers that
    // see `includes_files: false` should not expect `files` blocks on
    // the envelope bundles (legacy callers / downgraded responses).
    readonly includes_files: boolean;
  };
  readonly contacts: ReadonlyArray<unknown>;
  readonly templates: ReadonlyArray<unknown>;
  readonly envelopes: ReadonlyArray<{
    readonly envelope: Envelope;
    readonly signers: ReadonlyArray<EnvelopeSigner>;
    readonly events: ReadonlyArray<EnvelopeEvent>;
    readonly outbound_emails: ReadonlyArray<unknown>;
    // Issue #46 — attached when `meta.includes_files` is true. Each URL
    // is independently nullable: missing artifacts (drafts have no
    // sealed PDF; non-drawn signers have no signature image) emit
    // `null` without a warning, while storage failures emit `null` AND
    // surface a `warnings[]` entry keyed by storage path.
    readonly files: EnvelopeExportFiles;
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
    // Issue #46 — used to mint short-TTL signed URLs for every storage
    // artifact attached to the export (sealed PDF, audit PDF, original
    // PDF, signer signature/initials images).
    private readonly storage: StorageService,
    // Issues #38 / #43 — forensic breadcrumb for deleted accounts. We
    // record `(user_id, sha256(lowercase(email)))` BEFORE asking Supabase
    // to delete the auth row so a partial failure still leaves us with a
    // record of who used to own the preserved sealed envelopes.
    private readonly tombstonesRepo: TombstonesRepository,
  ) {}

  /**
   * Issue #46 — produce signed Storage URLs for every artifact attached
   * to a single envelope bundle. Failures degrade gracefully: the URL
   * field is set to `null` and a warning is appended so the caller can
   * retry. We never let one bad object abort the whole export.
   *
   * `null` storage paths (e.g. an audit PDF that hasn't been generated
   * yet) emit `null` URLs WITHOUT a warning — those are expected absent
   * artifacts, not failures.
   */
  private async signEnvelopeArtifacts(
    envelopeId: string,
    signers: ReadonlyArray<EnvelopeSigner>,
    warnings: Array<{ readonly code: string; readonly detail: string }>,
  ): Promise<EnvelopeExportFiles> {
    const filePaths = await this.envelopesRepo.getFilePaths(envelopeId);
    const signerImages = await this.envelopesRepo.listSignerImagePaths(envelopeId);

    const signOne = async (path: string | null | undefined): Promise<string | null> => {
      if (!path) return null;
      try {
        return await this.storage.createSignedUrl(path, EXPORT_SIGNED_URL_TTL_SECONDS);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        warnings.push({
          code: 'storage_url_failed',
          detail: `envelope ${envelopeId} object ${path}: ${detail}`,
        });
        return null;
      }
    };

    const [originalUrl, sealedUrl, auditUrl] = await Promise.all([
      signOne(filePaths?.original_file_path),
      signOne(filePaths?.sealed_file_path),
      signOne(filePaths?.audit_file_path),
    ]);

    // Order signer URLs to match `signers[]` so consumers can join by
    // index — but also key by signer_id since order is best-effort.
    const imagesById = new Map(signerImages.map((s) => [s.signer_id, s] as const));
    const signerFiles = await Promise.all(
      signers.map(async (s) => {
        const paths = imagesById.get(s.id);
        const [signatureUrl, initialsUrl] = await Promise.all([
          signOne(paths?.signature_image_path),
          signOne(paths?.initials_image_path),
        ]);
        return {
          signer_id: s.id,
          signature_image_url: signatureUrl,
          initials_image_url: initialsUrl,
        };
      }),
    );

    return {
      original_pdf_url: originalUrl,
      sealed_pdf_url: sealedUrl,
      audit_pdf_url: auditUrl,
      signers: signerFiles,
    };
  }

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
    // outbound emails + signed-URL-bearing files in parallel. Order
    // doesn't matter — the consumer sorts on its end. We bound
    // concurrency by `Promise.all` over the outer list, which is small
    // (envelopeIds is the user's lifetime count). If that ever gets
    // large, batch with a semaphore.
    const warnings: Array<{ readonly code: string; readonly detail: string }> = [];
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
        const files = await this.signEnvelopeArtifacts(envelopeId, aggregate.signers, warnings);
        return {
          envelope: aggregate,
          signers: aggregate.signers,
          events,
          outbound_emails: outboundEmails,
          files,
        };
      }),
    );

    const cleanEnvelopes = envelopes.filter((e): e is NonNullable<typeof e> => e !== null);
    const outboundEmailCount = cleanEnvelopes.reduce((n, e) => n + e.outbound_emails.length, 0);
    if (warnings.length > 0) {
      // The non-streamed path doesn't have a place to surface warnings
      // in the wire shape (it's frozen for backward compat), so we log
      // them and keep going. The streaming path attaches them to
      // `warnings[]`. If a consumer needs storage failure visibility
      // they should use /me/export (streaming) which is the controller
      // path; `exportAll` is for tests + small accounts.
      this.logger.warn(
        `export: ${warnings.length} storage URL warning(s) for user=${user.id}; first=${warnings[0]?.detail ?? ''}`,
      );
    }

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
        includes_files: true,
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
      // Issue #46 — streamed exports always attempt to attach signed
      // URLs. Per-object failures degrade to `null` URL + a `warnings[]`
      // entry; they never abort the stream.
      includes_files: true as const,
    };

    const repo = this.envelopesRepo;
    const outRepo = this.outboundEmailsRepo;
    const logger = this.logger;
    const signArtifacts = this.signEnvelopeArtifacts.bind(this);
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
            // Sign storage artifacts after hydration so we have the
            // signer ids; failures append to `warnings` but don't abort.
            const files = await signArtifacts(envelopeId, aggregate.signers, warnings);
            return {
              envelope: aggregate,
              signers: aggregate.signers,
              events,
              outbound_emails: outboundEmails,
              files,
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
   * T-20 / Issues #38 / #43 — DSAR-compliant account deletion that
   * preserves cryptographically-sealed records.
   *
   * GDPR Art. 17(3)(b/e) explicitly carves out exactly this case: the
   * "right to erasure" does not apply to records held for compliance
   * with a legal obligation, or for the establishment / exercise /
   * defence of legal claims. ESIGN §7001(d) AND eIDAS Art. 25(2) AND
   * most state-level contract-law statutes require that a sealed signed
   * record be retained for the full statutory window (typically 6-7
   * years) — independently of whether the parties later choose to
   * delete their auth records.
   *
   * Execution order is intentional:
   *   1. Wipe `idempotency_records` (FK does NOT cascade — left over,
   *      these would be orphans the user could never reach again).
   *   2. Hard-delete contacts (working state, no statutory retention).
   *   3. Hard-delete templates (working state).
   *   4. Atomic envelopes purge:
   *        a. Hard-delete drafts.
   *        b. For every non-draft (sealed/awaiting/declined/expired/
   *           canceled) envelope: anonymize signer rows that match
   *           the deleted user's email, append a `retention_deleted`
   *           audit event (chain stays intact), and NULL `owner_id`
   *           so the row survives Supabase's auth.users delete.
   *   5. Record a tombstone `(user_id, sha256(lowercase(email)))`
   *      BEFORE asking Supabase to delete the auth row. If Supabase
   *      then fails we still have a forensic breadcrumb of who used
   *      to own the preserved envelopes, and the tombstone upsert is
   *      idempotent so a retry won't duplicate.
   *   6. Ask Supabase to delete the `auth.users` row. The FK on
   *      envelopes is now `ON DELETE SET NULL` (migration 0012) as a
   *      belt-and-braces — if anyone bypasses this service path the
   *      sealed envelopes still survive.
   *
   * If the Supabase call fails we map to 503 — the user can retry; all
   * preceding steps are idempotent.
   */
  async deleteAccount(user: AuthUser): Promise<void> {
    const emailHash = createHash('sha256')
      .update((user.email ?? '').toLowerCase())
      .digest('hex');

    const wiped = await this.idempotencyRepo.deleteByUser(user.id);
    this.logger.log(`account-delete: idempotency_records wiped=${wiped} user=${user.id}`);

    const contactsDeleted = await this.contactsRepo.deleteAllByOwner(user.id);
    this.logger.log(`account-delete: contacts deleted=${contactsDeleted} user=${user.id}`);

    const templatesDeleted = await this.templatesRepo.deleteAllByOwner(user.id);
    this.logger.log(`account-delete: templates deleted=${templatesDeleted} user=${user.id}`);

    const purge = await this.envelopesRepo.purgeOwnedDataForAccountDeletion({
      owner_id: user.id,
      email: user.email,
      email_hash: emailHash,
    });
    this.logger.log(
      `account-delete: envelopes drafts_deleted=${purge.drafts_deleted} preserved=${purge.envelopes_preserved} signers_anonymized=${purge.signers_anonymized} retention_events=${purge.retention_events_appended} user=${user.id}`,
    );

    // Tombstone BEFORE the admin call — see method docstring step 5.
    await this.tombstonesRepo.recordDeletion({
      user_id: user.id,
      email_hash: emailHash,
    });
    this.logger.log(`account-delete: tombstone recorded user=${user.id}`);

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
