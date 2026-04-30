import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user';
import { ContactsRepository } from '../contacts/contacts.repository';
import { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import type { Envelope, EnvelopeEvent, EnvelopeSigner } from '../envelopes/envelope.entity';
import { TemplatesRepository } from '../templates/templates.repository';
import { IdempotencyRepository } from './idempotency.repository';
import { SupabaseAdminClient, SupabaseAdminError } from './supabase-admin.client';

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
   * T-19 — assemble an export of every row owned by the caller. The
   * result is JSON-serialisable; the controller wraps it with
   * `Content-Disposition: attachment` and an indented `JSON.stringify`
   * so the file is human-readable.
   *
   * Memory note: for an MVP we accumulate everything in memory before
   * returning. A power user with thousands of envelopes could OOM the
   * worker; switch to streaming JSON if/when that becomes a real
   * problem (TODO not before usage data demands it).
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
