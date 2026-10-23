import { randomUUID } from 'node:crypto';
import {
  ApiKeysRepository,
  nextDefaultKeyName,
  type ApiKeyRecord,
  type CreateApiKeyRowInput,
  type CreateApiKeyRowResult,
  type RevokeApiKeyResult,
} from '../src/api-keys/api-keys.repository';
import { insertOutboundEmailIdempotent } from '../src/email/insert-idempotent';
import type { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Hermetic `api_keys` double. Mirrors the Postgres adapter's contract:
 * cap and `Key N` decided atomically (JS is single-threaded between
 * awaits, which stands in for the advisory lock), unique prefix, unique
 * live name (case-insensitive), revoke keeps the row. The notification is
 * written to the given outbox; if that insert throws, the key is not kept.
 */
export class InMemoryApiKeysRepository extends ApiKeysRepository {
  readonly rows: Mutable<ApiKeyRecord>[] = [];
  touchCalls = 0;

  constructor(private readonly outbox?: OutboundEmailsRepository) {
    super();
  }

  reset(): void {
    this.rows.length = 0;
    this.touchCalls = 0;
  }

  /** Test helper: insert a row directly. */
  seed(
    row: Partial<ApiKeyRecord> & Pick<ApiKeyRecord, 'ownerId' | 'prefix' | 'keyHash'>,
  ): ApiKeyRecord {
    const full: Mutable<ApiKeyRecord> = {
      id: randomUUID(),
      name: nextDefaultKeyName(
        this.rows.filter((r) => r.ownerId === row.ownerId).map((r) => r.name),
      ),
      scopes: ['envelopes:read'],
      requireOwnerApproval: true,
      allowNewRecipients: false,
      alwaysRequireSignin: false,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      revokedAt: null,
      ...row,
    };
    this.rows.push(full);
    return { ...full };
  }

  async listLive(ownerId: string): Promise<readonly ApiKeyRecord[]> {
    return this.rows
      .filter((r) => r.ownerId === ownerId && r.revokedAt === null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({ ...r }));
  }

  async createWithinCap(input: CreateApiKeyRowInput): Promise<CreateApiKeyRowResult> {
    const owned = this.rows.filter((r) => r.ownerId === input.ownerId);
    const live = owned.filter((r) => r.revokedAt === null);
    if (live.length >= input.cap) return { ok: false, reason: 'cap_reached' };
    if (this.rows.some((r) => r.prefix === input.prefix))
      return { ok: false, reason: 'prefix_taken' };
    let name: string;
    if (input.name === null) {
      name = nextDefaultKeyName(owned.map((r) => r.name));
    } else {
      const wanted = input.name.toLowerCase();
      if (live.some((r) => r.name.toLowerCase() === wanted))
        return { ok: false, reason: 'name_taken' };
      name = input.name;
    }
    const row: Mutable<ApiKeyRecord> = {
      id: randomUUID(),
      ownerId: input.ownerId,
      name,
      prefix: input.prefix,
      keyHash: input.keyHash,
      scopes: [...input.scopes],
      requireOwnerApproval: true,
      allowNewRecipients: false,
      alwaysRequireSignin: input.alwaysRequireSignin,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    // Build and store the email before the key: a failure keeps neither.
    const email = input.notification({ ...row });
    if (this.outbox) await insertOutboundEmailIdempotent(this.outbox, email);
    this.rows.push(row);
    return { ok: true, key: { ...row } };
  }

  async findByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    const row = this.rows.find((r) => r.prefix === prefix);
    return row ? { ...row } : null;
  }

  async revoke(ownerId: string, id: string, now: Date): Promise<RevokeApiKeyResult> {
    const row = this.rows.find((r) => r.id === id && r.ownerId === ownerId);
    if (!row) return 'not_found';
    if (row.revokedAt !== null) return 'already_revoked';
    row.revokedAt = now.toISOString();
    return 'revoked';
  }

  async findOwned(ownerId: string, id: string): Promise<ApiKeyRecord | null> {
    const row = this.rows.find((r) => r.id === id && r.ownerId === ownerId);
    return row ? { ...row } : null;
  }

  async setRequireOwnerApproval(
    ownerId: string,
    id: string,
    value: boolean,
  ): Promise<ApiKeyRecord | null> {
    const row = this.rows.find((r) => r.id === id && r.ownerId === ownerId && r.revokedAt === null);
    if (!row) return null;
    row.requireOwnerApproval = value;
    return { ...row };
  }

  async touchLastUsed(id: string, now: Date): Promise<void> {
    this.touchCalls += 1;
    const row = this.rows.find((r) => r.id === id);
    if (!row) return;
    if (row.lastUsedAt === null || now.getTime() - Date.parse(row.lastUsedAt) >= 60_000) {
      row.lastUsedAt = now.toISOString();
    }
  }

  async deleteAllByOwner(ownerId: string): Promise<number> {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      if (this.rows[i]?.ownerId === ownerId) this.rows.splice(i, 1);
    }
    return before - this.rows.length;
  }
}
