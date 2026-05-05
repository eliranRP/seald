import { FetchGoogleOAuthClient } from '../google-oauth.client';

/**
 * Regression tests for FetchGoogleOAuthClient.exchangeCode.
 *
 * Pre-fix (2026-05-04 prod incident, "Bug E" in
 * .claude/gdrive-feature/phase6a-iter2-prod-qa.md): the client called
 * https://www.googleapis.com/oauth2/v3/userinfo to fetch the consenting
 * user's `sub` + `email`. That endpoint requires `openid email` scopes;
 * our requested scope is `https://www.googleapis.com/auth/drive.file`
 * only (per the CLAUDE.md scope-minimization contract). Live Google
 * therefore returned 403 on userinfo and the OAuth callback threw
 * `google_oauth_userinfo_failed` → 500 → SPA never saw a connected
 * account row. The bug never tripped CI because every existing spec
 * mocked the OAuthClient interface and never exercised the real fetch
 * path.
 *
 * Fix: switch to https://www.googleapis.com/drive/v3/about?fields=user
 * which is reachable under `drive.file` and returns the same
 * `permissionId` (sub) + `emailAddress`. These tests pin both the
 * URL the client hits and the field-mapping on the response.
 */
describe('FetchGoogleOAuthClient.exchangeCode', () => {
  const tokenJson = {
    access_token: 'access-tok',
    refresh_token: 'refresh-tok',
    expires_in: 3600,
    scope:
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
  };

  const aboutJson = {
    user: {
      permissionId: 'google-permission-id-123',
      emailAddress: 'eliran@example.com',
      displayName: 'Eliran Azulay',
    },
  };

  function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: unknown }>): {
    fetchImpl: typeof fetch;
    calls: Array<{ url: string; init?: RequestInit }>;
  } {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let i = 0;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const r = responses[i++];
      if (!r) throw new Error(`unexpected fetch call #${i} to ${String(url)}`);
      calls.push({ url: String(url), ...(init !== undefined ? { init } : {}) });
      return {
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 400),
        json: async () => r.body,
        text: async () => JSON.stringify(r.body),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  it('uses drive/v3/about?fields=user (NOT oauth2/v3/userinfo) to identify the consenting user', async () => {
    const { fetchImpl, calls } = mockFetchSequence([
      { ok: true, body: tokenJson },
      { ok: true, body: aboutJson },
    ]);
    const client = new FetchGoogleOAuthClient(
      'cid',
      'csecret',
      'https://api.example/cb',
      fetchImpl,
    );

    await client.exchangeCode('code-abc', 'verifier-xyz');

    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe('https://oauth2.googleapis.com/token');
    expect(calls[1]!.url).toBe('https://www.googleapis.com/drive/v3/about?fields=user');
    // Hard guard: the legacy userinfo URL must NEVER reappear under the
    // drive.file scope. CLAUDE.md "OAuth scope is hard-coded to
    // drive.file (per-file consent only). Do not broaden" forbids the
    // openid/email scopes that userinfo needs.
    expect(calls.map((c) => c.url)).not.toContain('https://www.googleapis.com/oauth2/v3/userinfo');
  });

  it('maps drive about.user.{permissionId,emailAddress} to {googleUserId,googleEmail}', async () => {
    const { fetchImpl } = mockFetchSequence([
      { ok: true, body: tokenJson },
      { ok: true, body: aboutJson },
    ]);
    const client = new FetchGoogleOAuthClient(
      'cid',
      'csecret',
      'https://api.example/cb',
      fetchImpl,
    );

    const result = await client.exchangeCode('code-abc', 'verifier-xyz');

    expect(result.googleUserId).toBe('google-permission-id-123');
    expect(result.googleEmail).toBe('eliran@example.com');
    expect(result.refreshToken).toBe('refresh-tok');
    expect(result.accessToken).toBe('access-tok');
    expect(result.scope).toBe(
      'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly',
    );
  });

  it('passes the access token as a Bearer credential when calling drive about', async () => {
    const { fetchImpl, calls } = mockFetchSequence([
      { ok: true, body: tokenJson },
      { ok: true, body: aboutJson },
    ]);
    const client = new FetchGoogleOAuthClient(
      'cid',
      'csecret',
      'https://api.example/cb',
      fetchImpl,
    );

    await client.exchangeCode('code-abc', 'verifier-xyz');

    const aboutCall = calls[1]!;
    const headers = (aboutCall.init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${tokenJson.access_token}`);
  });

  it('throws google_oauth_about_failed when drive/v3/about responds non-2xx', async () => {
    const { fetchImpl } = mockFetchSequence([
      { ok: true, body: tokenJson },
      { ok: false, status: 401, body: { error: { code: 401, message: 'unauthorized' } } },
    ]);
    const client = new FetchGoogleOAuthClient(
      'cid',
      'csecret',
      'https://api.example/cb',
      fetchImpl,
    );

    await expect(client.exchangeCode('code-abc', 'verifier-xyz')).rejects.toThrow(
      'google_oauth_about_failed',
    );
  });
});
