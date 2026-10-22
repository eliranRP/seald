import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Selectable } from 'kysely';
import type { ApiKeysTable, Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import { insertOutboundEmailIdempotent } from '../email/insert-idempotent';
import { OutboundEmailsPgRepository } from '../email/outbound-emails.repository.pg';
import {
  ApiKeysRepository,
  nextDefaultKeyName,
  type ApiKeyRecord,
  type CreateApiKeyRowInput,
  type CreateApiKeyRowResult,
  type RevokeApiKeyResult,
} from './api-keys.repository';

const LAST_USED_RESOLUTION_MS = 60_000;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return new Date(value).toISOString();
}

function toRecord(row: Selectable<ApiKeysTable>): ApiKeyRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    prefix: row.prefix,
    keyHash: row.key_hash,
    scopes: [...row.scopes],
    requireOwnerApproval: row.require_owner_approval,
    allowNewRecipients: row.allow_new_recipients,
    alwaysRequireSignin: row.always_require_signin,
    createdAt: new Date(row.created_at).toISOString(),
    lastUsedAt: iso(row.last_used_at),
    expiresAt: iso(row.expires_at),
    revokedAt: iso(row.revoked_at),
  };
}

function uniqueViolation(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { code?: string; constraint?: string };
  if (e.code !== '23505') return null;
  return e.constraint ?? '';
}

@Injectable()
export class ApiKeysPgRepository extends ApiKeysRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async listLive(ownerId: string): Promise<readonly ApiKeyRecord[]> {
    const rows = await this.db
      .selectFrom('api_keys')
      .selectAll()
      .where('owner_id', '=', ownerId)
      .where('revoked_at', 'is', null)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .execute();
    return rows.map(toRecord);
  }

  async createWithinCap(input: CreateApiKeyRowInput): Promise<CreateApiKeyRowResult> {
    try {
      return await this.db.transaction().execute(async (trx) => {
        // Serialize every create for this owner. The lock is released at
        // commit or rollback; the key is namespaced so it cannot collide
        // with another feature's advisory locks on the same uuid.
        await sql`select pg_advisory_xact_lock(hashtextextended(${`api_keys:${input.ownerId}`}, 0))`.execute(
          trx,
        );

        const owned = await trx
          .selectFrom('api_keys')
          .select(['name', 'revoked_at'])
          .where('owner_id', '=', input.ownerId)
          .execute();
        const live = owned.filter((row) => row.revoked_at === null);
        if (live.length >= input.cap) return { ok: false, reason: 'cap_reached' } as const;

        let name: string;
        if (input.name === null) {
          name = nextDefaultKeyName(owned.map((row) => row.name));
        } else {
          const wanted = input.name.toLowerCase();
          if (live.some((row) => row.name.toLowerCase() === wanted)) {
            return { ok: false, reason: 'name_taken' } as const;
          }
          name = input.name;
        }

        const row = await trx
          .insertInto('api_keys')
          .values({
            owner_id: input.ownerId,
            name,
            prefix: input.prefix,
            key_hash: input.keyHash,
            scopes: [...input.scopes],
            expires_at: input.expiresAt,
            always_require_signin: input.alwaysRequireSignin,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        const key = toRecord(row);

        // Same transaction: a rollback drops the email with the key.
        await insertOutboundEmailIdempotent(
          new OutboundEmailsPgRepository(trx),
          input.notification(key),
        );
        return { ok: true, key } as const;
      });
    } catch (err) {
      const constraint = uniqueViolation(err);
      if (constraint === 'api_keys_prefix_key') return { ok: false, reason: 'prefix_taken' };
      if (constraint === 'api_keys_owner_name_live_idx') return { ok: false, reason: 'name_taken' };
      throw err;
    }
  }

  async findByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    const row = await this.db
      .selectFrom('api_keys')
      .selectAll()
      .where('prefix', '=', prefix)
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async revoke(ownerId: string, id: string, now: Date): Promise<RevokeApiKeyResult> {
    const updated = await this.db
      .updateTable('api_keys')
      .set({ revoked_at: now.toISOString() })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    if (updated) return 'revoked';
    const existing = await this.db
      .selectFrom('api_keys')
      .select('id')
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    return existing ? 'already_revoked' : 'not_found';
  }

  async touchLastUsed(id: string, now: Date): Promise<void> {
    const threshold = new Date(now.getTime() - LAST_USED_RESOLUTION_MS);
    await this.db
      .updateTable('api_keys')
      .set({ last_used_at: now.toISOString() })
      .where('id', '=', id)
      .where((eb) => eb.or([eb('last_used_at', 'is', null), eb('last_used_at', '<', threshold)]))
      .execute();
  }

  async deleteAllByOwner(ownerId: string): Promise<number> {
    const result = await this.db
      .deleteFrom('api_keys')
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }
}
