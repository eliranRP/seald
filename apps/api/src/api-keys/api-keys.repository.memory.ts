import { randomUUID } from 'node:crypto';
import { MAX_LIVE_API_KEYS } from 'shared';
import { nextKeyName } from './api-key-secret';
import type { InsertApiKeyInput } from './api-keys.repository';
import { ApiKeysRepository, countsTowardLiveCap } from './api-keys.repository';
import {
  ApiKeyLimitError,
  ApiKeyNameTakenError,
  ApiKeyPrefixCollisionError,
  type ApiKeyRecord,
} from './api-keys.types';

/**
 * Process-local key store for unit tests and the API e2e. The per-owner
 * promise chain stands in for the Postgres advisory transaction lock.
 */
export class InMemoryApiKeysRepository extends ApiKeysRepository {
  readonly rows: ApiKeyRecord[] = [];
  readonly expiredApprovalKeyIds: string[] = [];
  private readonly tails = new Map<string, Promise<unknown>>();

  reset(): void {
    this.rows.length = 0;
    this.expiredApprovalKeyIds.length = 0;
    this.tails.clear();
  }

  private lock<T>(ownerId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(ownerId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.tails.set(
      ownerId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  async insertLive(input: InsertApiKeyInput): Promise<ApiKeyRecord> {
    return this.lock(input.ownerId, async () => {
      const notRevoked = this.rows.filter(
        (row) => row.ownerId === input.ownerId && row.revokedAt === null,
      );
      const occupying = notRevoked.filter((row) => countsTowardLiveCap(row.expiresAt, Date.now()));
      if (occupying.length >= MAX_LIVE_API_KEYS) throw new ApiKeyLimitError();
      if (this.rows.some((row) => row.prefix === input.prefix)) {
        throw new ApiKeyPrefixCollisionError();
      }
      const name = input.name ?? nextKeyName(notRevoked.map((row) => row.name));
      if (notRevoked.some((row) => row.name.toLowerCase() === name.toLowerCase())) {
        throw new ApiKeyNameTakenError();
      }
      const row: ApiKeyRecord = {
        id: randomUUID(),
        ownerId: input.ownerId,
        name,
        prefix: input.prefix,
        keyHash: input.keyHash,
        scopes: [...input.scopes],
        requireOwnerApproval: input.requireOwnerApproval,
        allowNewRecipients: input.allowNewRecipients,
        alwaysRequireSignin: input.alwaysRequireSignin,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        expiresAt: input.expiresAt,
        revokedAt: null,
      };
      this.rows.push(row);
      return row;
    });
  }

  async listByOwner(ownerId: string): Promise<readonly ApiKeyRecord[]> {
    return this.rows
      .filter((row) => row.ownerId === ownerId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async findByIdForOwner(id: string, ownerId: string): Promise<ApiKeyRecord | null> {
    return this.rows.find((row) => row.id === id && row.ownerId === ownerId) ?? null;
  }

  async findByPrefix(prefix: string): Promise<ApiKeyRecord | null> {
    return this.rows.find((row) => row.prefix === prefix) ?? null;
  }

  async revoke(id: string, ownerId: string, revokedAt: string): Promise<ApiKeyRecord | null> {
    const row = await this.findByIdForOwner(id, ownerId);
    if (!row) return null;
    if (row.revokedAt) return row;
    const next: ApiKeyRecord = { ...row, revokedAt };
    const index = this.rows.findIndex((item) => item.id === id);
    if (index >= 0) this.rows[index] = next;
    return next;
  }

  async touchLastUsed(id: string, now: Date): Promise<void> {
    const row = this.rows.find((item) => item.id === id);
    if (!row) return;
    if (row.lastUsedAt) {
      const age = now.getTime() - Date.parse(row.lastUsedAt);
      if (age < 60_000) return;
    }
    const next: ApiKeyRecord = { ...row, lastUsedAt: now.toISOString() };
    const index = this.rows.findIndex((item) => item.id === id);
    if (index >= 0) this.rows[index] = next;
  }

  async expirePendingApprovals(keyId: string, _now: Date): Promise<void> {
    this.expiredApprovalKeyIds.push(keyId);
  }
}
