import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user';
import { GDriveController } from './gdrive.controller';
import { GDriveService, type GoogleOAuthClient } from './gdrive.service';
import { GDriveKmsService, type KmsClientPort } from './gdrive-kms.service';
import { type GDriveAccount, type GDriveRepository } from './gdrive.repository';
import { OAuthStateStore } from './oauth-pkce';
import { FEATURE_FLAGS } from 'shared';

class FakeRepo implements GDriveRepository {
  rows = new Map<string, GDriveAccount>();
  async findByIdForUser(id: string, userId: string): Promise<GDriveAccount | null> {
    const r = this.rows.get(id);
    return r && r.userId === userId ? r : null;
  }
  async listForUser(userId: string): Promise<ReadonlyArray<GDriveAccount>> {
    return [...this.rows.values()].filter((r) => r.userId === userId && !r.deletedAt);
  }
  async insert(row: GDriveAccount): Promise<GDriveAccount> {
    this.rows.set(row.id, row);
    return row;
  }
  async softDelete(id: string, userId: string): Promise<boolean> {
    const r = this.rows.get(id);
    if (!r || r.userId !== userId) return false;
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
    const k = Buffer.alloc(32, 9);
    return { plaintext: k, ciphertextBlob: Buffer.concat([Buffer.from('K|'), k]) };
  }
  async decrypt(blob: Buffer): Promise<Buffer> {
    return blob.subarray(blob.indexOf(0x7c) + 1);
  }
}

class StubGoogleClient implements GoogleOAuthClient {
  exchange = {
    refreshToken: 'rt-from-google',
    accessToken: 'at-from-google',
    expiresAt: Date.now() + 3600_000,
    googleUserId: 'g-sub-1',
    googleEmail: 'user@example.com',
    scope: 'https://www.googleapis.com/auth/drive.file',
  };
  filesListReturns: { files: ReadonlyArray<{ id: string; name: string; mimeType: string }> } = {
    files: [{ id: 'f1', name: 'doc.pdf', mimeType: 'application/pdf' }],
  };
  filesListCalls = 0;

  async exchangeCode(): Promise<typeof this.exchange> {
    return this.exchange;
  }
  async refreshAccessToken(): Promise<{ accessToken: string; expiresAt: number }> {
    return { accessToken: 'at-refreshed', expiresAt: Date.now() + 3600_000 };
  }
  async revokeToken(): Promise<void> {
    /* noop */
  }
}

const USER_1: AuthUser = { id: 'user-1', email: 'u1@example.com', provider: 'google' };

const CFG = {
  clientId: 'cid',
  clientSecret: 'csecret',
  redirectUri: 'http://localhost:3000/integrations/gdrive/oauth/callback',
  appPublicUrl: 'http://localhost:5173',
};

function makeController(): {
  ctrl: GDriveController;
  repo: FakeRepo;
  google: StubGoogleClient;
  state: OAuthStateStore;
} {
  const repo = new FakeRepo();
  const kms = new GDriveKmsService(new StubKmsClient(), 'arn:aws:kms:us-east-1:000000000000:key/k');
  const google = new StubGoogleClient();
  const svc = new GDriveService(repo, kms, google);
  const state = new OAuthStateStore();
  const ctrl = new GDriveController(svc, state, CFG);
  return { ctrl, repo, google, state };
}

describe('GDriveController', () => {
  // Force the flag on for these tests; explicit off-test below.
  beforeEach(() => {
    (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = true;
  });
  afterAll(() => {
    (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = false;
  });

  it('GET /oauth/url returns a Google consent URL with drive.file scope (NOT drive)', async () => {
    const { ctrl } = makeController();
    const out = await ctrl.consentUrl(USER_1);
    expect(out.url).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(out.url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file');
    // Crucially, it must NOT include the broad `drive` scope or
    // `drive.readonly`. Negative assertion is the contract guard.
    expect(out.url).not.toMatch(/scope=https%3A%2F%2Fwww\.googleapis\.com%2Fauth%2Fdrive(&|$)/);
    expect(out.url).not.toContain('drive.readonly');
    expect(out.url).toContain('code_challenge_method=S256');
    expect(out.url).toContain('access_type=offline');
  });

  it('GET /oauth/callback rejects with 400 when state nonce is unknown', async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.oauthCallback('any-code', 'unknown-state', undefined, fakeRes()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('GET /oauth/callback rejects with oauth-declined when error=access_denied', async () => {
    const { ctrl } = makeController();
    await expect(
      ctrl.oauthCallback('', 'unknown', 'access_denied', fakeRes()),
    ).rejects.toMatchObject({ message: expect.stringContaining('oauth-declined') });
  });

  it('GET /oauth/callback persists an account row and redirects to /settings/integrations', async () => {
    const { ctrl, state, repo } = makeController();
    const started = state.start('user-1');
    const res = fakeRes();
    await ctrl.oauthCallback('the-code', started.state, undefined, res);
    expect(res.redirectedTo).toMatch(/\/settings\/integrations/);
    const accounts = await repo.listForUser('user-1');
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.googleEmail).toBe('user@example.com');
    // The plaintext refresh token must NOT appear inside the persisted
    // ciphertext column. This is the row-level expression of red-flag #3.
    expect(accounts[0]?.refreshTokenCiphertext.toString('utf8')).not.toContain('rt-from-google');
  });

  it('GET /accounts lists only the caller user accounts (sanitized view)', async () => {
    const { ctrl, state } = makeController();
    const started = state.start('user-1');
    await ctrl.oauthCallback('the-code', started.state, undefined, fakeRes());
    const out = await ctrl.listAccounts(USER_1);
    expect(out).toHaveLength(1);
    // Sanitized — must not leak ciphertext or KMS ARN to clients.
    expect(out[0]).not.toHaveProperty('refreshTokenCiphertext');
    expect(out[0]).not.toHaveProperty('refreshTokenKmsKeyArn');
  });

  it('DELETE /accounts/:id soft-deletes the row', async () => {
    const { ctrl, state, repo } = makeController();
    const started = state.start('user-1');
    await ctrl.oauthCallback('the-code', started.state, undefined, fakeRes());
    const [acc] = await repo.listForUser('user-1');
    if (!acc) throw new Error('no acc');
    await ctrl.deleteAccount(acc.id, USER_1);
    // The row remains but `deleted_at` is set; listForUser filters it out.
    expect(repo.rows.get(acc.id)?.deletedAt).toBeTruthy();
    expect(await repo.listForUser('user-1')).toHaveLength(0);
  });

  it('feature flag off → every route 404s', async () => {
    (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = false;
    const { ctrl } = makeController();
    await expect(ctrl.consentUrl(USER_1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctrl.listAccounts(USER_1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      ctrl.deleteAccount('00000000-0000-0000-0000-000000000000', USER_1),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(() => ctrl.listFiles(USER_1, 'acc-1', 'all')).toThrow(NotFoundException);
    await expect(ctrl.oauthCallback('c', 's', undefined, fakeRes())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // WT-A-2 contract: GET /files is intentionally a 501 stub in WT-A-1.
  // The full rate-limited Drive proxy lands in `feature/gdrive-files-proxy`.
  // This test pins the contract so WT-A-2 must explicitly remove/replace
  // it when it wires the real proxy in.
  it('GET /files returns 501 not-implemented (WT-A-2 stub contract)', () => {
    const { ctrl } = makeController();
    let caught: unknown;
    try {
      ctrl.listFiles(USER_1, 'acc-1', 'pdf');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(HttpException);
    const httpErr = caught as HttpException;
    expect(httpErr.getStatus()).toBe(HttpStatus.NOT_IMPLEMENTED);
    expect(httpErr.getResponse()).toMatchObject({ code: 'not-implemented' });
  });
});

interface FakeRes {
  redirect: (url: string) => void;
  redirectedTo: string | null;
}
function fakeRes(): FakeRes {
  const r: FakeRes = {
    redirectedTo: null,
    redirect(url: string) {
      r.redirectedTo = url;
    },
  };
  return r;
}
