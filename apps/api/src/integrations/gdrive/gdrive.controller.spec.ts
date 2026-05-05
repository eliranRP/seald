import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user';
import { IS_PUBLIC_KEY } from '../../auth/public.decorator';
import { GDriveController, type FilesProxy } from './gdrive.controller';
import { GDriveService, type GoogleOAuthClient } from './gdrive.service';
import { GDriveKmsService, type KmsClientPort } from './gdrive-kms.service';
import { type GDriveAccount, type GDriveRepository } from './gdrive.repository';
import { OAuthStateStore } from './oauth-pkce';
import { GDriveRateLimiter } from './rate-limiter';
import { FEATURE_FLAGS } from 'shared';

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
    // Mirrors the prod partial UNIQUE index from migration 0013 — see
    // gdrive.service.spec.ts FakeRepo for the rationale.
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
    scope:
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
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
  pickerDeveloperKey: 'test-dev-key',
  pickerAppId: 'test-app-id',
};

interface ProxyCall {
  accessToken: string;
  mimeFilter: 'pdf' | 'doc' | 'docx' | 'all';
}

function makeController(opts?: { capacity?: number; windowMs?: number; proxyImpl?: FilesProxy }): {
  ctrl: GDriveController;
  repo: FakeRepo;
  google: StubGoogleClient;
  state: OAuthStateStore;
  proxyCalls: ProxyCall[];
  setProxy(impl: FilesProxy): void;
  limiter: GDriveRateLimiter;
} {
  const repo = new FakeRepo();
  const kms = new GDriveKmsService(new StubKmsClient(), 'arn:aws:kms:us-east-1:000000000000:key/k');
  const google = new StubGoogleClient();
  const svc = new GDriveService(repo, kms, google);
  const state = new OAuthStateStore();
  const limiter = new GDriveRateLimiter({
    capacity: opts?.capacity ?? 30,
    windowMs: opts?.windowMs ?? 60_000,
  });
  const proxyCalls: ProxyCall[] = [];
  let proxy: FilesProxy =
    opts?.proxyImpl ??
    (async (): Promise<{
      files: ReadonlyArray<{ id: string; name: string; mimeType: string }>;
    }> => ({ files: [{ id: 'f1', name: 'a.pdf', mimeType: 'application/pdf' }] }));
  const wrappedProxy: FilesProxy = (args) => {
    proxyCalls.push(args);
    return proxy(args);
  };
  const ctrl = new GDriveController(svc, state, CFG, limiter, wrappedProxy);
  return {
    ctrl,
    repo,
    google,
    state,
    proxyCalls,
    setProxy(impl: FilesProxy) {
      proxy = impl;
    },
    limiter,
  };
}

describe('GDriveController', () => {
  // Force the flag on for these tests; explicit off-test below.
  beforeEach(() => {
    (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = true;
  });
  afterAll(() => {
    (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = false;
  });

  it('GET /oauth/url returns a Google consent URL with drive.file scope only (no restricted scopes)', async () => {
    const { ctrl } = makeController();
    const out = await ctrl.consentUrl(USER_1);
    expect(out.url).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(out.url).toContain('drive.file');
    // Must NOT contain drive.readonly (RESTRICTED scope requiring paid CASA
    // audit) or the broad `drive` scope (full read+write).
    const scopeParam = decodeURIComponent(new URL(out.url).searchParams.get('scope') ?? '');
    const scopes = scopeParam.split(' ');
    expect(scopes).toContain('https://www.googleapis.com/auth/drive.file');
    expect(scopes).not.toContain('https://www.googleapis.com/auth/drive.readonly');
    expect(scopes).not.toContain('https://www.googleapis.com/auth/drive');
    expect(out.url).toContain('code_challenge_method=S256');
    expect(out.url).toContain('access_type=offline');
  });

  it('GET /oauth/url throws 503 (not a broken URL) when GDRIVE_OAUTH_CLIENT_ID is unset', async () => {
    // Phase 6.A iter-1 round-1 LOCAL bug: when GDRIVE_OAUTH_CLIENT_ID
    // (and/or _CLIENT_SECRET) was unset, gdrive.module.ts fell back to
    // an empty string and consentUrl happily returned a Google consent
    // URL with `client_id=` (empty). The user clicked Connect Google
    // Drive and Google's error page popped up with "Missing required
    // parameter: client_id" — confusing UX that hid the real cause
    // (server-side misconfig). Contract: when the OAuth client id or
    // secret are empty/unset and the feature flag is ON, the API must
    // throw 503 ServiceUnavailable so the SPA can render a friendly
    // "Drive integration is not configured on this server" notice
    // instead of silently bouncing the user to a broken Google URL.
    // Mirrors the existing GDriveKmsService stubFail pattern from
    // gdrive.module.ts (KMS already throws when ARN/region unset).
    const repo = new FakeRepo();
    const kms = new GDriveKmsService(
      new StubKmsClient(),
      'arn:aws:kms:us-east-1:000000000000:key/k',
    );
    const google = new StubGoogleClient();
    const svc = new GDriveService(repo, kms, google);
    const state = new OAuthStateStore();
    const limiter = new GDriveRateLimiter({ capacity: 30, windowMs: 60_000 });
    const proxy: FilesProxy = async () => ({ files: [] });
    const ctrlEmptyClient = new GDriveController(
      svc,
      state,
      { ...CFG, clientId: '' },
      limiter,
      proxy,
    );
    const ctrlEmptySecret = new GDriveController(
      svc,
      state,
      { ...CFG, clientSecret: '' },
      limiter,
      proxy,
    );
    await expect(ctrlEmptyClient.consentUrl(USER_1)).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
    await expect(ctrlEmptySecret.consentUrl(USER_1)).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
    });
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

  it('GET /oauth/callback persists an account row and redirects to the popup-bridge route', async () => {
    // Bug G (Phase 6.A iter-2 PROD, 2026-05-04): redirect target is the
    // dedicated `/oauth/gdrive/callback` bridge (mounted OUTSIDE
    // <AppShell />) so the popup is not mobile-redirected to /m/send
    // before its postMessage + window.close() effect can run.
    const { ctrl, state, repo } = makeController();
    const started = state.start('user-1');
    const res = fakeRes();
    await ctrl.oauthCallback('the-code', started.state, undefined, res);
    expect(res.redirectedTo).toMatch(/\/oauth\/gdrive\/callback\?connected=1/);
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

  // Regression for Phase 6 prod-bug-loop finding (2026-05-03):
  // /oauth/callback is reached by Google's top-level browser redirect,
  // which carries no Supabase JWT. Without @Public(), the global
  // APP_GUARD AuthGuard rejects the redirect with 401 missing_token
  // before the controller's requireFlag() runs — every Drive
  // connection attempt would 401 in production. The unit tests below
  // call the controller method directly and bypass the guard, so this
  // metadata assertion is the only place that catches the omission.
  it('GET /oauth/callback is marked @Public() so Google redirects bypass the global AuthGuard', () => {
    const meta: unknown = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      GDriveController.prototype.oauthCallback,
    );
    expect(meta).toBe(true);
  });

  it('feature flag off → every route 404s', async () => {
    (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = false;
    const { ctrl } = makeController();
    await expect(ctrl.consentUrl(USER_1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctrl.listAccounts(USER_1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      ctrl.deleteAccount('00000000-0000-0000-0000-000000000000', USER_1),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      ctrl.listFiles(USER_1, '00000000-0000-0000-0000-000000000aaa', 'all'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(ctrl.oauthCallback('c', 's', undefined, fakeRes())).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  // WT-A-2: real Drive files proxy. Replaces the WT-A-1 501 stub.
  describe('GET /files (WT-A-2)', () => {
    async function seedAccount(
      ctrl: GDriveController,
      state: OAuthStateStore,
      userId = 'user-1',
    ): Promise<string> {
      const started = state.start(userId);
      await ctrl.oauthCallback('the-code', started.state, undefined, fakeRes());
      const accs = await ctrl.listAccounts({ id: userId, email: 'x', provider: 'google' });
      const first = accs[0];
      if (!first) throw new Error('no acc');
      return first.id;
    }

    it('happy path: invokes the proxy with a fresh access token + mime filter, returns files', async () => {
      const { ctrl, state, proxyCalls } = makeController();
      const accountId = await seedAccount(ctrl, state);
      const out = await ctrl.listFiles(USER_1, accountId, 'pdf');
      expect(out).toEqual({ files: [{ id: 'f1', name: 'a.pdf', mimeType: 'application/pdf' }] });
      expect(proxyCalls).toHaveLength(1);
      expect(proxyCalls[0]?.mimeFilter).toBe('pdf');
      expect(proxyCalls[0]?.accessToken).toBe('at-refreshed');
    });

    it('rejects 400 unsupported-mime when mimeFilter is not in the allow-list', async () => {
      const { ctrl, state } = makeController();
      const accountId = await seedAccount(ctrl, state);
      await expect(
        ctrl.listFiles(USER_1, accountId, 'exe' as unknown as 'all'),
      ).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({ code: 'unsupported-mime' }),
      });
    });

    it('rejects 400 when accountId is not a UUID', async () => {
      const { ctrl } = makeController();
      await expect(ctrl.listFiles(USER_1, 'not-a-uuid', 'pdf')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns 429 with Retry-After header when rate limit is hit', async () => {
      const { ctrl, state } = makeController({ capacity: 1, windowMs: 60_000 });
      const accountId = await seedAccount(ctrl, state);
      await ctrl.listFiles(USER_1, accountId, 'pdf');
      let caught: unknown;
      try {
        await ctrl.listFiles(USER_1, accountId, 'pdf');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(HttpException);
      const httpErr = caught as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const resp = httpErr.getResponse() as { code?: string; retryAfter?: number };
      expect(resp.code).toBe('rate-limited');
      expect(typeof resp.retryAfter).toBe('number');
      expect(resp.retryAfter).toBeGreaterThan(0);
    });

    it('rate-limit cache key is userId, NOT accountId (so rotating accountIds cannot bypass)', async () => {
      const { ctrl, state } = makeController({ capacity: 1, windowMs: 60_000 });
      const a1 = await seedAccount(ctrl, state);
      // Second connect for same user — overwrites the cached row but should
      // share the same per-user bucket (capacity:1 → second call should 429).
      const started2 = state.start('user-1');
      await ctrl.oauthCallback('the-code', started2.state, undefined, fakeRes());
      const a2 = (await ctrl.listAccounts(USER_1))[1]?.id ?? a1;
      await ctrl.listFiles(USER_1, a1, 'pdf');
      await expect(ctrl.listFiles(USER_1, a2, 'pdf')).rejects.toMatchObject({
        status: 429,
      });
    });

    it('maps Drive 401 → 401 token-expired (SPA reconnects)', async () => {
      const { ctrl, state, setProxy } = makeController();
      const accountId = await seedAccount(ctrl, state);
      setProxy(async () => {
        throw new Error('drive_files_list_failed: 401');
      });
      await expect(ctrl.listFiles(USER_1, accountId, 'pdf')).rejects.toMatchObject({
        status: 401,
        response: expect.objectContaining({ code: 'token-expired' }),
      });
    });

    it('maps Drive 403 → 403 oauth-declined (per-file consent revoked)', async () => {
      const { ctrl, state, setProxy } = makeController();
      const accountId = await seedAccount(ctrl, state);
      setProxy(async () => {
        throw new Error('drive_files_list_failed: 403');
      });
      await expect(ctrl.listFiles(USER_1, accountId, 'pdf')).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({ code: 'oauth-declined' }),
      });
    });

    it('maps Drive 5xx → 502 drive-upstream-error (token never leaked in message)', async () => {
      const { ctrl, state, setProxy } = makeController();
      const accountId = await seedAccount(ctrl, state);
      setProxy(async () => {
        throw new Error('drive_files_list_failed: 503');
      });
      let caught: unknown;
      try {
        await ctrl.listFiles(USER_1, accountId, 'pdf');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(HttpException);
      const httpErr = caught as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
      const resp = httpErr.getResponse() as { code?: string; message?: string };
      expect(resp.code).toBe('drive-upstream-error');
      // Defence in depth: even though `Error.message` could carry token
      // text, the response body must NOT echo internal error strings.
      expect(JSON.stringify(resp)).not.toContain('at-refreshed');
      expect(JSON.stringify(resp)).not.toContain('rt-from-google');
    });

    it('returns NotFound when accountId belongs to another user (no existence leak)', async () => {
      const { ctrl, state } = makeController();
      const accountId = await seedAccount(ctrl, state, 'user-1');
      const otherUser: AuthUser = { id: 'user-2', email: 'u2@example.com', provider: 'google' };
      await expect(ctrl.listFiles(otherUser, accountId, 'pdf')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // PR 2a: picker-credentials endpoint backs the Google Picker UI in the
  // SPA (Path A fix for the empty Drive picker bug). The frontend rewrite
  // ships in PR 2b — this describe block locks the wire contract.
  describe('GET /picker-credentials', () => {
    async function seedAccount(
      ctrl: GDriveController,
      state: OAuthStateStore,
      userId = 'user-1',
    ): Promise<string> {
      const started = state.start(userId);
      await ctrl.oauthCallback('the-code', started.state, undefined, fakeRes());
      const accs = await ctrl.listAccounts({ id: userId, email: 'x', provider: 'google' });
      const first = accs[0];
      if (!first) throw new Error('no acc');
      return first.id;
    }

    it('returns { accessToken, developerKey, appId } for an owned account when env is fully configured', async () => {
      const { ctrl, state } = makeController();
      const accountId = await seedAccount(ctrl, state);
      const out = await ctrl.pickerCredentials(USER_1, accountId);
      expect(out).toEqual({
        accessToken: 'at-refreshed',
        developerKey: 'test-dev-key',
        appId: 'test-app-id',
      });
    });

    it('rejects 400 when accountId is not a UUID', async () => {
      const { ctrl } = makeController();
      await expect(ctrl.pickerCredentials(USER_1, 'not-a-uuid')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('feature flag off → 404 NotFoundException', async () => {
      (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = false;
      const { ctrl } = makeController();
      await expect(
        ctrl.pickerCredentials(USER_1, '00000000-0000-0000-0000-000000000aaa'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 503 when developerKey env is empty (mirrors requireOAuthConfigured)', async () => {
      const repo = new FakeRepo();
      const kms = new GDriveKmsService(
        new StubKmsClient(),
        'arn:aws:kms:us-east-1:000000000000:key/k',
      );
      const google = new StubGoogleClient();
      const svc = new GDriveService(repo, kms, google);
      const state = new OAuthStateStore();
      const limiter = new GDriveRateLimiter({ capacity: 30, windowMs: 60_000 });
      const proxy: FilesProxy = async () => ({ files: [] });
      const ctrl = new GDriveController(
        svc,
        state,
        { ...CFG, pickerDeveloperKey: '' },
        limiter,
        proxy,
      );
      await expect(
        ctrl.pickerCredentials(USER_1, '00000000-0000-0000-0000-000000000aaa'),
      ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    });

    it('throws 503 when appId env is empty', async () => {
      const repo = new FakeRepo();
      const kms = new GDriveKmsService(
        new StubKmsClient(),
        'arn:aws:kms:us-east-1:000000000000:key/k',
      );
      const google = new StubGoogleClient();
      const svc = new GDriveService(repo, kms, google);
      const state = new OAuthStateStore();
      const limiter = new GDriveRateLimiter({ capacity: 30, windowMs: 60_000 });
      const proxy: FilesProxy = async () => ({ files: [] });
      const ctrl = new GDriveController(svc, state, { ...CFG, pickerAppId: '' }, limiter, proxy);
      await expect(
        ctrl.pickerCredentials(USER_1, '00000000-0000-0000-0000-000000000aaa'),
      ).rejects.toMatchObject({ status: HttpStatus.SERVICE_UNAVAILABLE });
    });

    it('returns 429 with retryAfter when rate limit is exhausted', async () => {
      const { ctrl, state } = makeController({ capacity: 1, windowMs: 60_000 });
      const accountId = await seedAccount(ctrl, state);
      await ctrl.pickerCredentials(USER_1, accountId);
      let caught: unknown;
      try {
        await ctrl.pickerCredentials(USER_1, accountId);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(HttpException);
      const httpErr = caught as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const resp = httpErr.getResponse() as { code?: string; retryAfter?: number };
      expect(resp.code).toBe('rate-limited');
      expect(typeof resp.retryAfter).toBe('number');
      expect(resp.retryAfter).toBeGreaterThan(0);
    });

    it('maps token-expired (Drive 401 from refresh) → 401', async () => {
      const { ctrl, state, google } = makeController();
      const accountId = await seedAccount(ctrl, state);
      // Force the next refreshAccessToken() to reject with the
      // taxonomy's TokenExpiredError — same pattern getAccessToken uses
      // when the refresh fails with 401 invalid_grant.
      const { TokenExpiredError } = await import('./dto/error-codes');
      google.refreshAccessToken = async (): Promise<never> => {
        throw new TokenExpiredError('reconnect_required');
      };
      await expect(ctrl.pickerCredentials(USER_1, accountId)).rejects.toMatchObject({
        status: 401,
        response: expect.objectContaining({ code: 'token-expired' }),
      });
    });

    it('returns NotFound when accountId belongs to another user (no existence leak)', async () => {
      const { ctrl, state } = makeController();
      const accountId = await seedAccount(ctrl, state, 'user-1');
      const otherUser: AuthUser = { id: 'user-2', email: 'u2@example.com', provider: 'google' };
      await expect(ctrl.pickerCredentials(otherUser, accountId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
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
