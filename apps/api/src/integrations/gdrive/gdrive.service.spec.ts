import { GDriveService, type GoogleOAuthClient } from './gdrive.service';
import type { GDriveAccount, GDriveRepository } from './gdrive.repository';
import { GDriveKmsService, type KmsClientPort } from './gdrive-kms.service';
import { TokenExpiredError } from './dto/error-codes';

class FakeRepo implements GDriveRepository {
  rows = new Map<string, GDriveAccount>();
  async findByIdForUser(id: string, userId: string): Promise<GDriveAccount | null> {
    const r = this.rows.get(id);
    return r && r.userId === userId ? r : null;
  }
  async listForUser(userId: string): Promise<ReadonlyArray<GDriveAccount>> {
    return [...this.rows.values()].filter((r) => r.userId === userId);
  }
  async insert(row: GDriveAccount): Promise<GDriveAccount> {
    this.rows.set(row.id, row);
    return row;
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

  async exchangeCode(): Promise<never> {
    throw new Error('not used in this spec');
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
    scope: 'https://www.googleapis.com/auth/drive.file',
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
});
