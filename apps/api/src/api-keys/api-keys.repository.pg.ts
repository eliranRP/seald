import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Selectable } from 'kysely';
import { MAX_LIVE_API_KEYS, isApiKeyScope, type ApiKeyScope } from 'shared';
import type { ApiKeysTable, Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import { nextKeyName } from './api-key-secret';
import type { InsertApiKeyInput } from './api-keys.repository';
import { ApiKeysRepository, countsTowardLiveCap } from './api-keys.repository';
import {
  ApiKeyLimitError,
  ApiKeyNameTakenError,
  ApiKeyPrefixCollisionError,
  type ApiKeyRecord,
} from './api-keys.types';

type Row = Selectable<ApiKeysTable>;

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asScopes(value: unknown): ApiKeyScope[] {
  const raw: string[] = [];
  if (Array.isArray(value)) {
    for (const item of value) raw.push(String(item));
  } else if (typeof value === 'string') {
    const inner = value.replace(/^\{/, '').replace(/\}$/, '');
    if (inner.length > 0) raw.push(...inner.split(','));
  }
  return raw.filter(isApiKeyScope);
}

function toRecord(row: Row): ApiKeyRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    prefix: row.prefix,
    keyHash: row.key_hash,
    scopes: asScopes(row.scopes),
    requireOwnerApproval: row.require_owner_approval,
    allowNewRecipients: row.allow_new_recipients,
    alwaysRequireSignin: row.always_require_signin,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    lastUsedAt: toIso(row.last_used_at),
    expiresAt: toIso(row.expires_at),
    revokedAt: toIso(row.revoked_at),
  };
}

function advisoryPair(ownerId: string): readonly [number, number] {
  const hex = ownerId.replace(/-/g, '');
  const a = Number.parseInt(hex.slice(0, 8), 16) | 0;
  const b = Number.parseInt(hex.slice(8, 16), 16) | 0;
  return [a, b];
}

function pgErrorCode(err: unknown): { code: string; constraint: string } | null {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof record.code === 'string') {
      return {
        code: record.code,
        constraint: typeof record.constraint === 'string' ? record.constraint : '',
      };
    }
    current = record.cause;
  }
  return null;
}

@Injectable()
export class ApiKeysPgRepository extends ApiKeysRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async insertLive(input: InsertApiKeyInput): Promise<ApiKeyRecord> {
    const [lockA, lockB] = advisoryPair(input.ownerId);
    try {
      return await this.db.transaction().execute(async (trx) => {
        // cspell:disable-next-line
        await sql`select pg_advisory_xact_lock(${lockA}::integer, ${lockB}::integer)`.execute(trx);
        const notRevoked = await trx
          .selectFrom('api_keys')
          .selectAll()
          .where('owner_id', '=', input.ownerId)
          .where('revoked_at', 'is', null)
          .execute();
        const nowMs = Date.now();
        const occupying = notRevoked.filter((row) => countsTowardLiveCap(row.expires_at, nowMs));
        if (occupying.length >= MAX_LIVE_API_KEYS) throw new ApiKeyLimitError();
        const name = input.name ?? nextKeyName(notRevoked.map((row) => row.name));
        if (notRevoked.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
          throw new ApiKeyNameTakenError();
        }
        const inserted = await trx
          .insertInto('api_keys')
          .values({
            owner_id: input.ownerId,
            name,
            prefix: input.prefix,
            key_hash: input.keyHash,
            scopes: input.scopes,
            require_owner_approval: input.requireOwnerApproval,
            allow_new_recipients: input.allowNewRecipients,
            always_require_signin: input.alwaysRequireSignin,
            expires_at: input.expiresAt,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        return toRecord(inserted);
      });
    } catch (err) {
      if (err instanceof ApiKeyLimitError || err instanceof ApiKeyNameTakenError) throw err;
      const pg = pgErrorCode(err);
      if (pg?.code === '23505') {
        if (pg.constraint.includes('prefix')) throw new ApiKeyPrefixCollisionError();
        throw new ApiKeyNameTakenError();
      }
      throw err;
    }
  }

  async listByOwner(ownerId: string): Promise<readonly ApiKeyRecord[]> {
    const rows = await this.db
      .selectFrom('api_keys')
      .selectAll()
      .where('owner_id', '=', ownerId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toRecord);
  }

  async findByIdForOwner(id: string, ownerId: string): Promise<ApiKeyRecord | null> {
    const row = await this.db
      .selectFrom('api_keys')
      .selectAll()
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async findByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    const row = await this.db
      .selectFrom('api_keys')
      .selectAll()
      .where('prefix', '=', prefix)
      .executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async revoke(id: string, ownerId: string, revokedAt: string): Promise<ApiKeyRecord | null> {
    const existing = await this.findByIdForOwner(id, ownerId);
    if (!existing) return null;
    if (existing.revokedAt) return existing;
    const row = await this.db
      .updateTable('api_keys')
      .set({ revoked_at: revokedAt })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('revoked_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    return row ? toRecord(row) : existing;
  }

  async touchLastUsed(id: string, now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - 60_000);
    await this.db
      .updateTable('api_keys')
      .set({ last_used_at: now.toISOString() })
      .where('id', '=', id)
      .where((eb) => eb.or([eb('last_used_at', 'is', null), eb('last_used_at', '<', cutoff)]))
      .execute();
  }

  async expirePendingApprovals(keyId: string, now: Date): Promise<void> {
    let reg: string | null = null;
    try {
      const found = await sql<{ reg: string | null }>`
        select to_regclass('public.mcp_approvals') as reg
      `.execute(this.db);
      reg = found.rows[0]?.reg ?? null;
    } catch {
      return;
    }
    if (!reg) return;
    await sql`
      update public.mcp_approvals
         set expires_at = ${now.toISOString()}::timestamptz
       where api_key_id = ${keyId}::uuid
         and approved_at is null
         and denied_at is null
         and expires_at > now()
    `.execute(this.db);
  }
}
