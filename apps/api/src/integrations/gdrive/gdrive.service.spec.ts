import { GDriveService, type GoogleOAuthClient } from './gdrive.service';
import type { GDriveAccount, GDriveRepository } from './gdrive.repository';
import { GDriveKmsService, type KmsClientPort } from './gdrive-kms.service';
import { TokenExpiredError } from './dto/error-codes';

class FakeRepo implements GDriveRepository {
  rows = new Map<string, GDriveAccount>();
  async findByIdForUser(id: string, userId: string): Promise<GDriveAccount | null> {
    const r = this.rows.get(id);
    return r && r.userId === userId && !r.deletedAt ? r : null;
  }
  async listForUser(userId: string): Promise<ReadonlyArray<GDriveAccount>> {
    return [...this.rows.values()].filter((r) => r.userId === userId && !r.deletedAt);
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
  async softDelete(id: string, _userId: string): Promise<boolean> {
    const r = this.rows.get(id);
    if (!r) return false;
    this.rows.set(id, { ...r, deletedAt: new Date().toISOString() });
    return true;
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
  async revokeToken(): Promise<void> {
    /* no-op */
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
    await seedAccount(repo, kms, 'rt-revoked');
    google.refreshFailWith = 'invalid_grant';
    await expect(svc.getAccessToken('acc-1', 'user-1')).rejects.toBeInstanceOf(TokenExpiredError);
    await svc.getAccessToken('acc-1', 'user-1').catch((err: unknown) => {
      expect((err as TokenExpiredError).code).toBe('token-expired');
    });
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
      const decrypted = await kms.decrypt(acc.refreshTokenCiphertext, acc.refreshTokenKmsKeyArn);
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
});
