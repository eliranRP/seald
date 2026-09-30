import { Logger } from '@nestjs/common';
import { GDriveService, GDRIVE_REVOKE_TIMEOUT_MS, type GoogleOAuthClient } from '../gdrive.service';
import type { GDriveAccount, GDriveRepository } from '../gdrive.repository';
import { GDriveKmsService, type KmsClientPort } from '../gdrive-kms.service';
import { TokenExpiredError } from '../dto/error-codes';

class FakeRepo implements GDriveRepository {
  rows = new Map<string, GDriveAccount>();
  async findByIdForUser(id: string, userId: string): Promise<GDriveAccount | null> {
    const r = this.rows.get(id);
    return r && r.userId === userId && !r.deletedAt ? r : null;
  }
  async findByIdForUserIncludingDeleted(id: string, userId: string): Promise<GDriveAccount | null> {
    const r = this.rows.get(id);
    return r && r.userId === userId ? r : null;
  }
  async listForUser(userId: string): Promise<ReadonlyArray<GDriveAccount>> {
    return [...this.rows.values()].filter((r) => r.userId === userId && !r.deletedAt);
  }
  async listAllForUser(userId: string): Promise<ReadonlyArray<GDriveAccount>> {
    return [...this.rows.values()].filter((r) => r.userId === userId);
  }
  async insert(row: GDriveAccount): Promise<GDriveAccount> {
    // Enforce the partial UNIQUE index from migration 0013_gdrive_accounts.sql:
    //   create unique index gdrive_accounts_user_google_uniq
    //     on gdrive_accounts (user_id, google_user_id) where deleted_at is null;
    // Without this, the fake silently accepts duplicates and Bug H is
    // unreproducible in unit tests. Match the real Postgres error so the
    // service layer can branch on it (or, post-fix, avoid hitting it).
    for (const r of this.rows.values()) {
      if (!r.deletedAt && r.userId === row.userId && r.googleUserId === row.googleUserId) {
        const e = new Error(
          'duplicate key value violates unique constraint "gdrive_accounts_user_google_uniq"',
        ) as Error & { code?: string };
        e.code = '23505';
        throw e;
      }
    }
    this.rows.set(row.id, row);
    return row;
  }
  async findActiveByUserAndGoogleUser(
    userId: string,
    googleUserId: string,
  ): Promise<GDriveAccount | null> {
    return (
      [...this.rows.values()].find(
        (r) => r.userId === userId && r.googleUserId === googleUserId && !r.deletedAt,
      ) ?? null
    );
  }
  async replaceToken(args: {
    id: string;
    refreshTokenCiphertext: Buffer;
    refreshTokenKmsKeyArn: string;
    scope: string;
    googleEmail: string;
  }): Promise<GDriveAccount> {
    const r = this.rows.get(args.id);
    if (!r) throw new Error('replaceToken: row not found');
    // Preserve the original connectedAt — it's immutable in the real
    // schema (ColumnType<…, never>) and represents the first OAuth grant.
    const next: GDriveAccount = {
      ...r,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      refreshTokenKmsKeyArn: args.refreshTokenKmsKeyArn,
      scope: args.scope,
      googleEmail: args.googleEmail,
      lastUsedAt: null,
    };
    this.rows.set(args.id, next);
    return next;
  }
  async disconnect(id: string, userId: string): Promise<boolean> {
    const r = this.rows.get(id);
    if (!r || r.userId !== userId) return false;
    this.rows.set(id, {
      ...r,
      deletedAt: r.deletedAt ?? new Date().toISOString(),
      refreshTokenCiphertext: null,
      refreshTokenKmsKeyArn: null,
    });
    return true;
  }
  async deleteAllByUser(userId: string): Promise<number> {
    let removed = 0;
    for (const [id, row] of this.rows) {
      if (row.userId !== userId) continue;
      this.rows.delete(id);
      removed += 1;
    }
    return removed;
  }
  async touchLastUsed(id: string): Promise<void> {
    const r = this.rows.get(id);
    if (r) this.rows.set(id, { ...r, lastUsedAt: new Date().toISOString() });
  }
}

class StubKmsClient implements KmsClientPort {
  async generateDataKey(): Promise<{ plaintext: Buffer; ciphertextBlob: Buffer }> {
    const k = Buffer.alloc(32, 7);
    return { plaintext: k, ciphertextBlob: Buffer.concat([Buffer.from('K|'), k]) };
  }
  async decrypt(blob: Buffer): Promise<Buffer> {
    return blob.subarray(blob.indexOf(0x7c) + 1);
  }
}

class StubGoogleClient implements GoogleOAuthClient {
  refreshCalls = 0;
  refreshDelayMs = 0;
  refreshFailWith: 'invalid_grant' | null = null;
  abortObserved = false;
  exchange = {
    refreshToken: 'rt-from-google',
    accessToken: 'at-from-google',
    expiresAt: Date.now() + 3600_000,
    googleUserId: 'g-1',
    googleEmail: 'a@example.com',
    scope:
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
  };

  async exchangeCode(): Promise<typeof this.exchange> {
    return this.exchange;
  }
  async refreshAccessToken(
    _refreshToken: string,
    signal?: AbortSignal,
  ): Promise<{ accessToken: string; expiresAt: number }> {
    this.refreshCalls++;
    if (this.refreshFailWith === 'invalid_grant') {
      const e = new Error('invalid_grant') as Error & { code?: string };
      e.code = 'invalid_grant';
      throw e;
    }
    if (this.refreshDelayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.refreshDelayMs);
        if (signal) {
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            this.abortObserved = true;
            reject(new Error('aborted'));
          });
        }
      });
    }
    return { accessToken: `at-${this.refreshCalls}`, expiresAt: Date.now() + 3600_000 };
  }
  revokeCalls = 0;
  lastRevoked: string | null = null;
  revokeError: Error | null = null;
  revokeHangs = false;
  onRevoke: (() => void) | null = null;
  async revokeToken(refreshToken: string, signal?: AbortSignal): Promise<void> {
    this.revokeCalls += 1;
    this.lastRevoked = refreshToken;
    this.onRevoke?.();
    if (this.revokeHangs) {
      await new Promise<void>((_resolve, reject) => {
        const abort = () => {
          this.abortObserved = true;
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        };
        if (signal?.aborted) {
          abort();
          return;
        }
        signal?.addEventListener('abort', abort, { once: true });
      });
      return;
    }
    if (this.revokeError) throw this.revokeError;
  }
}

const ARN = 'arn:aws:kms:us-east-1:000000000000:key/k';

async function seedAccount(
  repo: FakeRepo,
  kms: GDriveKmsService,
  refreshToken: string,
): Promise<GDriveAccount> {
  const enc = await kms.encrypt(refreshToken);
  const acc: GDriveAccount = {
    id: 'acc-1',
    userId: 'user-1',
    googleUserId: 'g-1',
    googleEmail: 'a@example.com',
    refreshTokenCiphertext: enc.ciphertext,
    refreshTokenKmsKeyArn: enc.kmsKeyArn,
    scope:
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
    connectedAt: new Date().toISOString(),
    lastUsedAt: null,
    deletedAt: null,
  };
  await repo.insert(acc);
  return acc;
}

describe('GDriveService', () => {
  let repo: FakeRepo;
  let kms: GDriveKmsService;
  let google: StubGoogleClient;
  let svc: GDriveService;

  beforeEach(() => {
    repo = new FakeRepo();
    kms = new GDriveKmsService(new StubKmsClient(), ARN);
    google = new StubGoogleClient();
    svc = new GDriveService(repo, kms, google);
  });

  it('refresh-token single-flight: 5 concurrent calls produce exactly 1 Google request', async () => {
    await seedAccount(repo, kms, 'rt-secret-1');
    google.refreshDelayMs = 25;
    const results = await Promise.all(
      Array.from({ length: 5 }).map(() => svc.getAccessToken('acc-1', 'user-1')),
    );
    expect(google.refreshCalls).toBe(1);
    // All 5 callers receive the same token from the in-flight promise.
    expect(new Set(results.map((r) => r.accessToken)).size).toBe(1);
  });

  it('returns the cached access token while it is still valid', async () => {
    await seedAccount(repo, kms, 'rt-secret-1');
    const a = await svc.getAccessToken('acc-1', 'user-1');
    const b = await svc.getAccessToken('acc-1', 'user-1');
    expect(google.refreshCalls).toBe(1);
    expect(a.accessToken).toBe(b.accessToken);
  });

  it('expired refresh-token branch surfaces TokenExpiredError (code: token-expired)', async () => {
    expect.assertions(2);
    await seedAccount(repo, kms, 'rt-revoked');
    google.refreshFailWith = 'invalid_grant';

    try {
      await svc.getAccessToken('acc-1', 'user-1');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TokenExpiredError);
      expect((err as TokenExpiredError).code).toBe('token-expired');
    }
  });

  it('AbortSignal aborts an in-flight token issuance', async () => {
    await seedAccount(repo, kms, 'rt-secret-1');
    google.refreshDelayMs = 200;
    const ctrl = new AbortController();
    const p = svc.getAccessToken('acc-1', 'user-1', ctrl.signal);
    setTimeout(() => ctrl.abort(), 10);
    await expect(p).rejects.toThrow();
    expect(google.abortObserved).toBe(true);
  });

  it('returns 404-ish (null) when account is missing or belongs to another user', async () => {
    await seedAccount(repo, kms, 'rt');
    await expect(svc.getAccessToken('acc-1', 'user-2')).rejects.toThrow();
    await expect(svc.getAccessToken('missing', 'user-1')).rejects.toThrow();
  });

  // Bug H (Phase 6.A iter-2 PROD, 2026-05-04). Connecting the same Google
  // account twice for the same user fired the partial UNIQUE
  //   gdrive_accounts (user_id, google_user_id) WHERE deleted_at IS NULL
  // and surfaced as `internal_error` (500) on the API callback — popup
  // never reached the bridge page, never closed. Fix: completeOAuth is
  // idempotent — finds the existing active row, rotates the refresh
  // token in place, returns the existing id.
  describe('completeOAuth idempotency (Bug H)', () => {
    it('reconnecting the same Google account reuses the existing row', async () => {
      // First connect → row inserted.
      google.exchange = { ...google.exchange, refreshToken: 'rt-1', googleUserId: 'g-1' };
      const id1 = await svc.completeOAuth({
        userId: 'u-1',
        code: 'code-1',
        codeVerifier: 'v-1',
      });

      // Second connect for the SAME (user, google) pair must NOT throw
      // a duplicate-key error — it should land on the existing row.
      google.exchange = { ...google.exchange, refreshToken: 'rt-2', googleUserId: 'g-1' };
      const id2 = await svc.completeOAuth({
        userId: 'u-1',
        code: 'code-2',
        codeVerifier: 'v-2',
      });

      expect(id2).toBe(id1);
      const accs = await repo.listForUser('u-1');
      expect(accs).toHaveLength(1);
    });

    it('reconnecting rotates the encrypted refresh token in place', async () => {
      google.exchange = { ...google.exchange, refreshToken: 'rt-old', googleUserId: 'g-1' };
      await svc.completeOAuth({ userId: 'u-1', code: 'code-1', codeVerifier: 'v-1' });

      google.exchange = { ...google.exchange, refreshToken: 'rt-new', googleUserId: 'g-1' };
      await svc.completeOAuth({ userId: 'u-1', code: 'code-2', codeVerifier: 'v-2' });

      const [acc] = await repo.listForUser('u-1');
      if (!acc) throw new Error('expected one account');
      const ciphertext = acc.refreshTokenCiphertext;
      const arn = acc.refreshTokenKmsKeyArn;
      if (!ciphertext || !arn) throw new Error('expected stored token');
      const decrypted = await kms.decrypt(ciphertext, arn);
      expect(decrypted).toBe('rt-new');
    });

    it('different users connecting the same Google account each get their own row', async () => {
      google.exchange = { ...google.exchange, refreshToken: 'rt-a', googleUserId: 'g-shared' };
      const idA = await svc.completeOAuth({
        userId: 'u-A',
        code: 'code-A',
        codeVerifier: 'v-A',
      });
      google.exchange = { ...google.exchange, refreshToken: 'rt-b', googleUserId: 'g-shared' };
      const idB = await svc.completeOAuth({
        userId: 'u-B',
        code: 'code-B',
        codeVerifier: 'v-B',
      });
      expect(idA).not.toBe(idB);
    });
  });

  describe('revokeAccount', () => {
    it('asks Google to revoke and clears the stored token while keeping the row', async () => {
      await seedAccount(repo, kms, 'rt-secret-1');
      google.onRevoke = () => {
        expect(repo.rows.get('acc-1')?.refreshTokenCiphertext).toBeNull();
        expect(repo.rows.get('acc-1')?.refreshTokenKmsKeyArn).toBeNull();
      };
      await svc.revokeAccount('acc-1', 'user-1');

      expect(google.revokeCalls).toBe(1);
      expect(google.lastRevoked).toBe('rt-secret-1');
      const row = repo.rows.get('acc-1');
      expect(row?.deletedAt).toBeTruthy();
      expect(row?.refreshTokenCiphertext).toBeNull();
      expect(row?.refreshTokenKmsKeyArn).toBeNull();
      expect(row?.googleEmail).toBe('a@example.com');
      expect(row?.googleUserId).toBe('g-1');
      expect(await repo.listForUser('user-1')).toHaveLength(0);
    });

    it('still clears the token when the Google revoke call fails', async () => {
      await seedAccount(repo, kms, 'rt-secret-1');
      google.revokeError = new Error('google down');

      await svc.revokeAccount('acc-1', 'user-1');

      expect(google.revokeCalls).toBe(1);
      expect(repo.rows.get('acc-1')?.refreshTokenCiphertext).toBeNull();
      expect(repo.rows.get('acc-1')?.refreshTokenKmsKeyArn).toBeNull();
      expect(repo.rows.get('acc-1')?.deletedAt).toBeTruthy();
    });

    it('is idempotent after the token is cleared and does not revoke again', async () => {
      await seedAccount(repo, kms, 'rt-secret-1');
      await svc.revokeAccount('acc-1', 'user-1');
      await svc.revokeAccount('acc-1', 'user-1');

      expect(google.revokeCalls).toBe(1);
      expect(repo.rows.get('acc-1')?.refreshTokenCiphertext).toBeNull();
    });

    it('clears a legacy soft-deleted row that still holds a token', async () => {
      const seeded = await seedAccount(repo, kms, 'rt-legacy');
      const existing = repo.rows.get(seeded.id);
      if (!existing) throw new Error('expected seeded row');
      repo.rows.set(seeded.id, { ...existing, deletedAt: '2026-01-01T00:00:00.000Z' });

      await svc.revokeAccount(seeded.id, 'user-1');

      expect(google.revokeCalls).toBe(1);
      expect(google.lastRevoked).toBe('rt-legacy');
      expect(repo.rows.get(seeded.id)?.refreshTokenCiphertext).toBeNull();
      expect(repo.rows.get(seeded.id)?.deletedAt).toBe('2026-01-01T00:00:00.000Z');
    });

    it('erases the token locally when the Google revoke hangs and returns within the timeout', async () => {
      await seedAccount(repo, kms, 'rt-secret-1');
      google.revokeHangs = true;
      const started = Date.now();
      await svc.revokeAccount('acc-1', 'user-1');
      const elapsed = Date.now() - started;

      expect(elapsed).toBeLessThan(GDRIVE_REVOKE_TIMEOUT_MS + 1_500);
      expect(google.abortObserved).toBe(true);
      expect(google.revokeCalls).toBe(1);
      expect(google.lastRevoked).toBe('rt-secret-1');
      expect(repo.rows.get('acc-1')?.refreshTokenCiphertext).toBeNull();
      expect(repo.rows.get('acc-1')?.refreshTokenKmsKeyArn).toBeNull();
      expect(repo.rows.get('acc-1')?.deletedAt).toBeTruthy();
    }, 15_000);

    it('logs a revoke failure without the token value', async () => {
      await seedAccount(repo, kms, 'rt-secret-1');
      google.revokeError = new Error('token=rt-secret-1');
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await svc.revokeAccount('acc-1', 'user-1');

      const lines = warn.mock.calls.map((call) => String(call[0]));
      expect(lines.some((line) => line.includes('gdrive_revoke_failed account=acc-1'))).toBe(true);
      expect(lines.join('\n')).not.toContain('rt-secret-1');
      expect(repo.rows.get('acc-1')?.refreshTokenCiphertext).toBeNull();
      warn.mockRestore();
    });

    it('does not revoke or erase a row owned by someone else', async () => {
      await seedAccount(repo, kms, 'rt-secret-1');
      await expect(svc.revokeAccount('acc-1', 'user-2')).rejects.toThrow(
        'gdrive_account_not_found',
      );
      await expect(svc.revokeAccount('missing', 'user-1')).rejects.toThrow(
        'gdrive_account_not_found',
      );
      expect(google.revokeCalls).toBe(0);
      expect(repo.rows.get('acc-1')?.refreshTokenCiphertext).not.toBeNull();
      expect(repo.rows.get('acc-1')?.deletedAt).toBeNull();
    });
  });

  describe('revokeAllBeforeAccountDeletion', () => {
    it('revokes each stored token and still finishes when one revoke fails', async () => {
      await seedAccount(repo, kms, 'rt-live');
      const second = await kms.encrypt('rt-legacy');
      await repo.insert({
        id: 'acc-2',
        userId: 'user-1',
        googleUserId: 'g-2',
        googleEmail: 'b@example.com',
        refreshTokenCiphertext: second.ciphertext,
        refreshTokenKmsKeyArn: second.kmsKeyArn,
        scope: 'https://www.googleapis.com/auth/drive.file',
        connectedAt: new Date().toISOString(),
        lastUsedAt: null,
        deletedAt: '2026-01-01T00:00:00.000Z',
      });
      google.onRevoke = () => {
        google.revokeError = google.revokeCalls === 1 ? new Error('token=rt-live') : null;
      };
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

      await expect(svc.revokeAllBeforeAccountDeletion('user-1')).resolves.toBeUndefined();

      expect(google.revokeCalls).toBe(2);
      expect(repo.rows.get('acc-1')?.refreshTokenCiphertext).not.toBeNull();
      expect(repo.rows.get('acc-2')?.refreshTokenCiphertext).not.toBeNull();
      const lines = warn.mock.calls.map((call) => String(call[0])).join('\n');
      expect(lines).toContain('gdrive_revoke_failed account=acc-1');
      expect(lines).not.toContain('rt-live');
      expect(lines).not.toContain('rt-legacy');
      warn.mockRestore();
    });
  });
});
