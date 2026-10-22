import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, type Selectable, sql } from 'kysely';
import type { Database, SignerOtpChallengesTable } from '../../../db/schema';
import { DB_TOKEN } from '../../db/db.provider';
import {
  AccessAuthRepository,
  type AccessAuthSettingsPatch,
  type AttemptOutcome,
  type CreateChallengeResult,
  type OtpChallenge,
  type StoredAccessAuthSettings,
} from './access-auth.repository';
import { challengeState, sendWaitSeconds } from './access-code';

function toChallenge(row: Selectable<SignerOtpChallengesTable>): OtpChallenge {
  const date = (v: Date | string | null): Date | null => (v === null ? null : new Date(v));
  return {
    id: row.id,
    envelope_id: row.envelope_id,
    signer_id: row.signer_id,
    purpose: row.purpose,
    code_hash: row.code_hash,
    attempts: Number(row.attempts),
    expires_at: new Date(row.expires_at),
    sent_at: date(row.sent_at),
    consumed_at: date(row.consumed_at),
    locked_at: date(row.locked_at),
    superseded_at: date(row.superseded_at),
    created_at: new Date(row.created_at),
  };
}

/**
 * Postgres adapter for the signer access code (WP-10, migration 0026).
 * New queries live here, not in the legacy envelopes repository.
 */
@Injectable()
export class AccessAuthPgRepository extends AccessAuthRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async getSettings(envelope_id: string): Promise<StoredAccessAuthSettings | null> {
    const env = await this.db
      .selectFrom('envelopes')
      .select(['access_auth', 'action_auth'])
      .where('id', '=', envelope_id)
      .executeTakeFirst();
    if (!env) return null;
    const signers = await this.db
      .selectFrom('envelope_signers')
      .select(['id', 'access_auth', 'action_auth', 'signing_order', 'created_at'])
      .where('envelope_id', '=', envelope_id)
      .orderBy('signing_order')
      .orderBy('created_at')
      .orderBy('id')
      .execute();
    return {
      access_auth: env.access_auth,
      action_auth: env.action_auth,
      signers: signers.map((s) => ({
        signer_id: s.id,
        access_auth: s.access_auth,
        action_auth: s.action_auth,
      })),
    };
  }

  async setSettings(envelope_id: string, patch: AccessAuthSettingsPatch): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      const env = await trx
        .selectFrom('envelopes')
        .select(['status'])
        .where('id', '=', envelope_id)
        .forUpdate()
        .executeTakeFirst();
      if (!env || env.status !== 'draft') return false;
      const envelopeSet = {
        ...(patch.access_auth !== undefined ? { access_auth: patch.access_auth } : {}),
        ...(patch.action_auth !== undefined ? { action_auth: patch.action_auth } : {}),
      };
      await trx
        .updateTable('envelopes')
        .set({ ...envelopeSet, updated_at: new Date().toISOString() })
        .where('id', '=', envelope_id)
        .execute();
      for (const s of patch.signers ?? []) {
        const signerSet = {
          ...(s.access_auth !== undefined ? { access_auth: s.access_auth } : {}),
          ...(s.action_auth !== undefined ? { action_auth: s.action_auth } : {}),
        };
        if (Object.keys(signerSet).length === 0) continue;
        await trx
          .updateTable('envelope_signers')
          .set(signerSet)
          .where('envelope_id', '=', envelope_id)
          .where('id', '=', s.signer_id)
          .execute();
      }
      return true;
    });
  }

  async createChallenge(input: {
    readonly envelope_id: string;
    readonly signer_id: string;
    readonly purpose: OtpChallenge['purpose'];
    readonly now: Date;
    readonly ttl_seconds: number;
  }): Promise<CreateChallengeResult> {
    return this.db.transaction().execute(async (trx) => {
      // Serialize sends per signer: two parallel requests cannot both pass
      // the cooldown check.
      await trx
        .selectFrom('envelope_signers')
        .select('id')
        .where('id', '=', input.signer_id)
        .forUpdate()
        .executeTakeFirst();
      const hourAgo = new Date(input.now.getTime() - 3600_000);
      const recent = await trx
        .selectFrom('signer_otp_challenges')
        .select('created_at')
        .where('signer_id', '=', input.signer_id)
        .where('created_at', '>', hourAgo)
        .execute();
      const wait = sendWaitSeconds(
        recent.map((r) => new Date(r.created_at)),
        input.now,
      );
      if (wait) return { ok: false, reason: wait.reason, retry_after_seconds: wait.seconds };

      const nowIso = input.now.toISOString();
      await trx
        .updateTable('signer_otp_challenges')
        .set({ superseded_at: nowIso })
        .where('signer_id', '=', input.signer_id)
        .where('purpose', '=', input.purpose)
        .where('superseded_at', 'is', null)
        .where('consumed_at', 'is', null)
        .execute();
      const row = await trx
        .insertInto('signer_otp_challenges')
        .values({
          envelope_id: input.envelope_id,
          signer_id: input.signer_id,
          purpose: input.purpose,
          expires_at: new Date(input.now.getTime() + input.ttl_seconds * 1000).toISOString(),
          created_at: nowIso,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return { ok: true, challenge: toChallenge(row) };
    });
  }

  async supersede(challenge_id: string): Promise<void> {
    await this.db
      .updateTable('signer_otp_challenges')
      .set({ superseded_at: new Date().toISOString() })
      .where('id', '=', challenge_id)
      .where('superseded_at', 'is', null)
      .execute();
  }

  async armChallenge(input: {
    readonly challenge_id: string;
    readonly signer_id: string;
    readonly purpose: OtpChallenge['purpose'];
    readonly code_hash: string;
    readonly now: Date;
    readonly ttl_seconds: number;
  }): Promise<OtpChallenge | null> {
    const nowIso = input.now.toISOString();
    const row = await this.db
      .updateTable('signer_otp_challenges as c')
      .set({
        code_hash: input.code_hash,
        sent_at: nowIso,
        expires_at: new Date(input.now.getTime() + input.ttl_seconds * 1000).toISOString(),
      })
      .where('c.id', '=', input.challenge_id)
      .where('c.signer_id', '=', input.signer_id)
      .where('c.purpose', '=', input.purpose)
      .where('c.superseded_at', 'is', null)
      .where('c.consumed_at', 'is', null)
      .where('c.locked_at', 'is', null)
      .where(({ exists, selectFrom }) =>
        exists(
          selectFrom('envelope_signers as s')
            .innerJoin('envelopes as e', 'e.id', 's.envelope_id')
            .select(sql<number>`1`.as('one'))
            .whereRef('s.id', '=', 'c.signer_id')
            .where('e.status', '=', 'awaiting_others')
            .where('e.expires_at', '>', input.now)
            .where('s.signed_at', 'is', null)
            .where('s.declined_at', 'is', null),
        ),
      )
      .returningAll()
      .executeTakeFirst();
    return row ? toChallenge(row) : null;
  }

  async attempt(input: {
    readonly signer_id: string;
    readonly purpose: OtpChallenge['purpose'];
    readonly now: Date;
    readonly max_attempts: number;
    readonly verification_check: string;
    readonly matches: (challenge: OtpChallenge) => boolean;
  }): Promise<AttemptOutcome> {
    return this.db.transaction().execute(async (trx) => {
      const row = await trx
        .selectFrom('signer_otp_challenges')
        .selectAll()
        .where('signer_id', '=', input.signer_id)
        .where('purpose', '=', input.purpose)
        .where('superseded_at', 'is', null)
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .limit(1)
        .forUpdate()
        .executeTakeFirst();
      const challenge = row ? toChallenge(row) : null;
      const state = challengeState(challenge, input.now);
      if (state !== null || challenge === null) {
        return { kind: state ?? 'not_requested' };
      }
      const nowIso = input.now.toISOString();
      if (input.matches(challenge)) {
        const consumed = await trx
          .updateTable('signer_otp_challenges')
          .set({ consumed_at: nowIso })
          .where('id', '=', challenge.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        const signer = await trx
          .selectFrom('envelope_signers')
          .select('verification_checks')
          .where('id', '=', input.signer_id)
          .forUpdate()
          .executeTakeFirst();
        const checks = Array.isArray(signer?.verification_checks) ? signer.verification_checks : [];
        if (!checks.includes(input.verification_check)) {
          await trx
            .updateTable('envelope_signers')
            .set({ verification_checks: JSON.stringify([...checks, input.verification_check]) })
            .where('id', '=', input.signer_id)
            .execute();
        }
        return { kind: 'verified', challenge: toChallenge(consumed) };
      }
      const attempts = challenge.attempts + 1;
      const lockNow = attempts >= input.max_attempts;
      const updated = await trx
        .updateTable('signer_otp_challenges')
        .set({ attempts, ...(lockNow ? { locked_at: nowIso } : {}) })
        .where('id', '=', challenge.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return { kind: lockNow ? 'locked_now' : 'mismatch', challenge: toChallenge(updated) };
    });
  }
}
