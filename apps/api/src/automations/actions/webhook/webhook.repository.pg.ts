import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Database } from '../../../../db/schema';
import { DB_TOKEN } from '../../../db/db.provider';
import { withAutomationTables, type AutomationsDatabase } from '../../automations.schema';
import type { SealedValue } from './secret-box';

export interface StoredWebhookSecrets {
  readonly secret: SealedValue;
  readonly url: SealedValue;
  readonly previous: SealedValue | null;
  readonly previousRetiredAt: Date | null;
}

export interface WebhookEventRow {
  readonly eventCreatedAt: string;
  readonly envelope: {
    readonly id: string;
    readonly title: string;
    readonly status: string;
    readonly shortCode: string;
  };
  readonly signer: { readonly id: string; readonly name: string; readonly email: string } | null;
}

/**
 * Queries for the webhook action: the encrypted `automation_secrets` row
 * (ciphertext only; this class never sees a key or a plaintext) and the
 * allowlisted event fields a payload is built from.
 */
@Injectable()
export class WebhookPgRepository {
  private readonly db: Kysely<AutomationsDatabase>;

  constructor(@Inject(DB_TOKEN) db: Kysely<Database>) {
    this.db = withAutomationTables(db);
  }

  async getSecrets(automationId: string): Promise<StoredWebhookSecrets | null> {
    const row = await this.db
      .selectFrom('automation_secrets')
      .select([
        'secret_ciphertext',
        'secret_nonce',
        'url_ciphertext',
        'url_nonce',
        'previous_ciphertext',
        'previous_nonce',
        'previous_retired_at',
      ])
      .where('automation_id', '=', automationId)
      .executeTakeFirst();
    if (!row) return null;
    const previous =
      row.previous_ciphertext && row.previous_nonce
        ? {
            ciphertext: Buffer.from(row.previous_ciphertext),
            nonce: Buffer.from(row.previous_nonce),
          }
        : null;
    return {
      secret: {
        ciphertext: Buffer.from(row.secret_ciphertext),
        nonce: Buffer.from(row.secret_nonce),
      },
      url: { ciphertext: Buffer.from(row.url_ciphertext), nonce: Buffer.from(row.url_nonce) },
      previous,
      previousRetiredAt: row.previous_retired_at ? new Date(row.previous_retired_at) : null,
    };
  }

  /** First write for a recipe (or a full reset): new secret and URL, no previous. */
  async putSecrets(automationId: string, secret: SealedValue, url: SealedValue): Promise<void> {
    const values = {
      secret_ciphertext: secret.ciphertext,
      secret_nonce: secret.nonce,
      url_ciphertext: url.ciphertext,
      url_nonce: url.nonce,
      previous_ciphertext: null,
      previous_nonce: null,
      previous_retired_at: null,
    };
    await this.db
      .insertInto('automation_secrets')
      .values({ automation_id: automationId, ...values })
      .onConflict((oc) => oc.column('automation_id').doUpdateSet(values))
      .execute();
  }

  /** Replace the URL only. Returns false when the recipe has no secret row. */
  async replaceUrl(automationId: string, url: SealedValue): Promise<boolean> {
    const res = await this.db
      .updateTable('automation_secrets')
      .set({ url_ciphertext: url.ciphertext, url_nonce: url.nonce })
      .where('automation_id', '=', automationId)
      .executeTakeFirst();
    return Number(res.numUpdatedRows ?? 0n) > 0;
  }

  /**
   * Rotation: the current ciphertext moves to `previous_*` (it keeps its
   * nonce and its AAD, which is the automation id for both), the new secret
   * becomes current, and the previous one retires at `retiredAt`.
   */
  async rotateSecret(automationId: string, next: SealedValue, retiredAt: Date): Promise<boolean> {
    const res = await this.db
      .updateTable('automation_secrets')
      .set((eb) => ({
        previous_ciphertext: eb.ref('secret_ciphertext'),
        previous_nonce: eb.ref('secret_nonce'),
        previous_retired_at: retiredAt.toISOString(),
        secret_ciphertext: next.ciphertext,
        secret_nonce: next.nonce,
      }))
      .where('automation_id', '=', automationId)
      .executeTakeFirst();
    return Number(res.numUpdatedRows ?? 0n) > 0;
  }

  /** Daily pass: drop previous secrets whose 24-hour window has ended. */
  async clearRetiredPrevious(now: Date): Promise<number> {
    const res = await this.db
      .updateTable('automation_secrets')
      .set({ previous_ciphertext: null, previous_nonce: null, previous_retired_at: null })
      .where('previous_retired_at', '<=', now)
      .executeTakeFirst();
    return Number(res.numUpdatedRows ?? 0n);
  }

  /** The allowlisted fields for one run's payload. Null when the envelope is gone. */
  async loadEvent(input: {
    readonly envelopeId: string | null;
    readonly eventId: string | null;
    readonly signerId: string | null;
  }): Promise<WebhookEventRow | null> {
    if (!input.envelopeId) return null;
    const envelope = await this.db
      .selectFrom('envelopes')
      .select(['id', 'title', 'status', 'short_code'])
      .where('id', '=', input.envelopeId)
      .executeTakeFirst();
    if (!envelope) return null;
    const event = input.eventId
      ? await this.db
          .selectFrom('envelope_events')
          .select(['created_at'])
          .where('id', '=', input.eventId)
          .where('envelope_id', '=', input.envelopeId)
          .executeTakeFirst()
      : undefined;
    const signer = input.signerId
      ? await this.db
          .selectFrom('envelope_signers')
          .select(['id', 'name', 'email'])
          .where('id', '=', input.signerId)
          .where('envelope_id', '=', input.envelopeId)
          .executeTakeFirst()
      : undefined;
    const createdAt = event?.created_at ?? null;
    return {
      eventCreatedAt: (createdAt ? new Date(createdAt) : new Date()).toISOString(),
      envelope: {
        id: envelope.id,
        title: envelope.title,
        status: envelope.status,
        shortCode: envelope.short_code,
      },
      signer: signer ? { id: signer.id, name: signer.name, email: signer.email } : null,
    };
  }
}
