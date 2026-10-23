import { MCP_OAUTH_LIFETIMES } from 'shared';
import { hashSecret } from '../oauth-secrets';
import { TokenError } from '../oauth-token.service';
import {
  CHALLENGE,
  CIMD_CLIENT,
  CIMD_REDIRECT,
  ISSUER,
  NOW,
  OTHER,
  OWNER,
  PRE_CLIENT,
  PRE_REDIRECT,
  RESOURCE,
  approveCode,
  authRequest,
  cimdDoc,
  exchange,
  oauthWorld,
  owner,
  refresh,
} from './oauth-fixtures';

const later = (ms: number): Date => new Date(NOW.getTime() + ms);
const DAY = 86_400_000;

async function tokenError(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(err instanceof TokenError)) throw new Error(`expected TokenError, got ${String(err)}`);
  return err.code;
}

describe('authorization endpoint validation', () => {
  it('forwards a valid request to the consent page with normalized parameters', async () => {
    const w = oauthWorld();
    const url = new URL(await w.authorization.authorizeRedirect(authRequest()));
    expect(`${url.origin}${url.pathname}`).toBe('https://app.seald.test/oauth/mcp/consent');
    expect(Object.fromEntries(url.searchParams)).toEqual(authRequest());
  });

  it('never redirects to an unknown client or an unregistered redirect URI', async () => {
    const w = oauthWorld();
    for (const over of [
      { client_id: 'not-registered' },
      { redirect_uri: 'https://evil.example/cb' },
      { redirect_uri: undefined },
      { client_id: 'https://unknown.example.org/c.json' },
    ]) {
      const url = new URL(await w.authorization.authorizeRedirect(authRequest(over)));
      expect(url.origin).toBe('https://app.seald.test');
      expect(url.searchParams.get('error')).toMatch(/^invalid_/);
      expect(url.searchParams.get('code')).toBeNull();
    }
  });

  it('a repeated parameter is refused, not guessed', async () => {
    const w = oauthWorld();
    const v = await w.authorization.validate({ ...authRequest(), client_id: [PRE_CLIENT, 'x'] });
    expect(v).toEqual({ ok: false, redirect: false, error: 'invalid_request' });
  });

  it.each([
    [{ response_type: 'token' }, 'unsupported_response_type'],
    [{ code_challenge_method: 'plain' }, 'invalid_request'],
    [{ code_challenge: undefined }, 'invalid_request'],
    [{ code_challenge: 'short' }, 'invalid_request'],
    [{ scope: 'envelopes:read root' }, 'invalid_scope'],
    [{ resource: undefined }, 'invalid_target'],
    [{ resource: 'https://api.seald.test/api/v1' }, 'invalid_target'],
  ])('after the client is trusted, %j goes back to the client as %s', async (over, error) => {
    const w = oauthWorld();
    const url = new URL(await w.authorization.authorizeRedirect(authRequest(over)));
    expect(`${url.origin}${url.pathname}`).toBe(PRE_REDIRECT);
    expect(url.searchParams.get('error')).toBe(error);
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('iss')).toBe(ISSUER);
  });
});

describe('consent', () => {
  it('describes the client, its redirect host and the scopes', async () => {
    const w = oauthWorld();
    expect(await w.authorization.describe(owner(), authRequest(), NOW)).toEqual({
      client_name: 'Claude',
      redirect_host: 'claude.example',
      unverified: false,
      scopes: ['envelopes:read', 'envelopes:write'],
      fresh_login_required: false,
    });
  });

  it('labels a CIMD client unverified unless its host is on the verified list', async () => {
    const w = oauthWorld();
    const d = await w.authorization.describe(
      owner(),
      authRequest({ client_id: CIMD_CLIENT, redirect_uri: CIMD_REDIRECT }),
      NOW,
    );
    expect(d).toMatchObject({ client_name: 'Agent Example', unverified: true });
    const trusted = 'https://trusted.example.org/c.json';
    const w2 = oauthWorld({
      docs: {
        [trusted]: cimdDoc({
          client_id: trusted,
          redirect_uris: ['https://trusted.example.org/cb'],
        }),
      },
    });
    const d2 = await w2.authorization.describe(
      owner(),
      authRequest({ client_id: trusted, redirect_uri: 'https://trusted.example.org/cb' }),
      NOW,
    );
    expect(d2.unverified).toBe(false);
  });

  it('a guest session cannot consent; send-capable scopes need a fresh sign-in', async () => {
    const w = oauthWorld();
    await expect(
      w.authorization.decide(
        { ...owner(), email: null },
        { ...authRequest(), decision: 'approve' },
        NOW,
      ),
    ).rejects.toThrow('email_required');
    const stale = owner(3_600);
    const sendScopes = authRequest({ scope: 'envelopes:read envelopes:send' });
    expect((await w.authorization.describe(stale, sendScopes, NOW)).fresh_login_required).toBe(
      true,
    );
    await expect(
      w.authorization.decide(stale, { ...sendScopes, decision: 'approve' }, NOW),
    ).rejects.toThrow('fresh_login_required');
    expect(w.repo.codes).toHaveLength(0);
    await expect(
      approveCode(w, { scope: 'envelopes:read envelopes:send' }, owner(30)),
    ).resolves.toEqual(expect.any(String));
  });

  it('Deny sends access_denied with state and iss, and writes nothing', async () => {
    const w = oauthWorld();
    const { redirect_to } = await w.authorization.decide(
      owner(),
      { ...authRequest(), decision: 'deny' },
      NOW,
    );
    const url = new URL(redirect_to);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('iss')).toBe(ISSUER);
    expect(w.repo.grants).toHaveLength(0);
  });

  it('Approve stores only the code hash, bound to the request, and re-consent reuses the grant', async () => {
    const w = oauthWorld();
    const code = await approveCode(w);
    expect(w.repo.codes).toHaveLength(1);
    const stored = w.repo.codes[0];
    expect(stored).toMatchObject({
      codeHash: hashSecret(code),
      ownerId: OWNER,
      redirectUri: PRE_REDIRECT,
      codeChallenge: CHALLENGE,
      resource: RESOURCE,
      scopes: ['envelopes:read', 'envelopes:write'],
      expiresAt: later(MCP_OAUTH_LIFETIMES.codeSeconds * 1000).toISOString(),
    });
    expect(JSON.stringify(w.repo.codes)).not.toContain(code);
    await approveCode(w, { scope: 'envelopes:read' });
    expect(w.repo.grants).toHaveLength(1);
    expect(w.repo.grants[0]?.scopes).toEqual(['envelopes:read']);
  });
});

describe('token endpoint: code exchange', () => {
  it('exchanges a code once for an opaque access token and a refresh token', async () => {
    const w = oauthWorld();
    const code = await approveCode(w);
    const t = await exchange(w, code);
    expect(t).toMatchObject({
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'envelopes:read envelopes:write',
    });
    expect(t.access_token).toMatch(/^seald_oat_[A-Za-z0-9_-]{43}$/);
    expect(t.refresh_token).toMatch(/^seald_ort_[A-Za-z0-9_-]{43}$/);
    const stored = JSON.stringify([w.repo.access, w.repo.refresh]);
    expect(stored).not.toContain(t.access_token);
    expect(stored).not.toContain(t.refresh_token);
  });

  it.each([
    [{ code_verifier: 'w'.repeat(43) }, 'invalid_grant'],
    [{ redirect_uri: `${PRE_REDIRECT}/` }, 'invalid_grant'],
    [{ client_id: 'other-client' }, 'invalid_grant'],
    [{ resource: 'https://api.seald.test/other' }, 'invalid_target'],
    [{ resource: undefined }, 'invalid_request'],
    [{ code_verifier: undefined }, 'invalid_request'],
  ])('%j is refused as %s', async (over, error) => {
    const w = oauthWorld();
    const code = await approveCode(w);
    expect(await tokenError(exchange(w, code, over))).toBe(error);
  });

  it('an expired code is invalid_grant', async () => {
    const w = oauthWorld();
    const code = await approveCode(w);
    expect(await tokenError(exchange(w, code, {}, later(61_000)))).toBe('invalid_grant');
  });

  it('a second use of a code fails and revokes the tokens the first use produced', async () => {
    const w = oauthWorld();
    const code = await approveCode(w);
    const first = await exchange(w, code);
    expect((await w.access.verify(first.access_token, NOW)).ok).toBe(true);
    expect(await tokenError(exchange(w, code))).toBe('invalid_grant');
    expect(await w.access.verify(first.access_token, NOW)).toEqual({
      ok: false,
      error: 'invalid_token',
    });
    expect(await tokenError(refresh(w, first.refresh_token))).toBe('invalid_grant');
  });

  it('unknown grant types and missing grant_type', async () => {
    const w = oauthWorld();
    expect(await tokenError(w.tokens.token({ grant_type: 'client_credentials' }))).toBe(
      'unsupported_grant_type',
    );
    expect(await tokenError(w.tokens.token({}))).toBe('invalid_request');
    expect(await tokenError(w.tokens.token({ grant_type: ['a', 'b'] }))).toBe('invalid_request');
  });
});

describe('token endpoint: refresh rotation and reuse detection', () => {
  it('rotates: the new pair works, the old refresh token is spent', async () => {
    const w = oauthWorld();
    const t1 = await exchange(w, await approveCode(w));
    const t2 = await refresh(w, t1.refresh_token, {}, later(60_000));
    expect(t2.refresh_token).not.toBe(t1.refresh_token);
    expect((await w.access.verify(t2.access_token, later(61_000))).ok).toBe(true);
    // The rotated refresh token keeps the same family and absolute expiry.
    const rows = w.repo.refresh;
    expect(rows).toHaveLength(2);
    expect(rows[1]?.familyId).toBe(rows[0]?.familyId);
    expect(rows[1]?.absoluteExpiresAt).toBe(rows[0]?.absoluteExpiresAt);
    expect(rows[0]?.rotatedAt).not.toBeNull();
  });

  it('replaying a rotated refresh token revokes the whole grant and its pending approvals', async () => {
    const w = oauthWorld();
    const t1 = await exchange(w, await approveCode(w));
    const t2 = await refresh(w, t1.refresh_token);
    const grantId = w.repo.grants[0]?.id ?? '';
    // A pending approval of this grant.
    w.approvals.rows.push({
      id: '00000000-0000-4000-8000-00000000aaaa',
      ownerId: OWNER,
      apiKeyId: null,
      oauthGrantId: grantId,
      expiresAt: later(DAY).toISOString(),
      approvedAt: null,
      deniedAt: null,
      failedAt: null,
      expiredAt: null,
    } as (typeof w.approvals.rows)[number]);

    expect(await tokenError(refresh(w, t1.refresh_token))).toBe('invalid_grant');
    expect(w.repo.grants[0]?.revokedAt).not.toBeNull();
    expect(w.repo.grants[0]?.revokedReason).toBe('refresh_token_reuse');
    // Every token of the family is dead, including the newest pair.
    expect(await w.access.verify(t2.access_token, NOW)).toEqual({
      ok: false,
      error: 'invalid_token',
    });
    expect(await tokenError(refresh(w, t2.refresh_token))).toBe('invalid_grant');
    expect(w.approvals.rows[0]?.expiredReason).toBe('oauth_grant_revoked');
  });

  it('a refresh token is bound to its client', async () => {
    const w = oauthWorld();
    const t1 = await exchange(w, await approveCode(w));
    expect(await tokenError(refresh(w, t1.refresh_token, { client_id: 'someone-else' }))).toBe(
      'invalid_grant',
    );
    // Not treated as reuse: the right client can still refresh.
    await expect(refresh(w, t1.refresh_token)).resolves.toMatchObject({ token_type: 'Bearer' });
  });

  it('expires on the 7-day idle and the 30-day absolute lifetime', async () => {
    const w = oauthWorld();
    const t1 = await exchange(w, await approveCode(w));
    expect(await tokenError(refresh(w, t1.refresh_token, {}, later(7 * DAY + 1)))).toBe(
      'invalid_grant',
    );

    const w2 = oauthWorld();
    let t = await exchange(w2, await approveCode(w2));
    for (let day = 6; day < 30; day += 6) {
      t = await refresh(w2, t.refresh_token, {}, later(day * DAY));
    }
    expect(await tokenError(refresh(w2, t.refresh_token, {}, later(30 * DAY + 1)))).toBe(
      'invalid_grant',
    );
  });

  it('may narrow scopes, never widen them', async () => {
    const w = oauthWorld();
    const t1 = await exchange(w, await approveCode(w));
    expect(await tokenError(refresh(w, t1.refresh_token, { scope: 'envelopes:send' }))).toBe(
      'invalid_scope',
    );
    const t2 = await refresh(w, t1.refresh_token, { scope: 'envelopes:read' });
    expect(t2.scope).toBe('envelopes:read');
  });
});

describe('access tokens on /mcp', () => {
  it('maps to the key-shaped principal: grant scopes, approval always required', async () => {
    const w = oauthWorld();
    const t = await exchange(w, await approveCode(w));
    const p = await w.access.verify(t.access_token, NOW);
    expect(p).toMatchObject({
      ok: true,
      ownerId: OWNER,
      scopes: ['envelopes:read', 'envelopes:write'],
      keyName: 'Claude (connected app)',
      keyPrefix: '',
      requireOwnerApproval: true,
      allowNewRecipients: false,
    });
    if (!p.ok) throw new Error('unreachable');
    expect(p.oauth?.grantId).toBe(w.repo.grants[0]?.id);
    expect(p.keyId).toBe(w.repo.grants[0]?.id);
  });

  it('a narrowed grant narrows live tokens; expiry and wrong shape are invalid_token', async () => {
    const w = oauthWorld();
    const t = await exchange(w, await approveCode(w));
    await approveCode(w, { scope: 'envelopes:read' });
    const p = await w.access.verify(t.access_token, NOW);
    expect(p.ok && p.scopes).toEqual(['envelopes:read']);
    expect(await w.access.verify(t.access_token, later(3_600_001))).toEqual({
      ok: false,
      error: 'invalid_token',
    });
    expect(await w.access.verify(`seald_live_${'x'.repeat(43)}`, NOW)).toEqual({
      ok: false,
      error: 'invalid_token',
    });
  });
});

describe('revocation endpoint and connected apps', () => {
  it('revoking a refresh token kills its family; an access token only itself', async () => {
    const w = oauthWorld();
    const t = await exchange(w, await approveCode(w));
    const t2 = await exchange(w, await approveCode(w));
    await w.tokens.revoke({ token: t2.access_token, client_id: PRE_CLIENT });
    expect((await w.access.verify(t2.access_token, NOW)).ok).toBe(false);
    await expect(refresh(w, t2.refresh_token)).resolves.toMatchObject({ token_type: 'Bearer' });

    await w.tokens.revoke({ token: t.refresh_token, client_id: PRE_CLIENT });
    expect((await w.access.verify(t.access_token, NOW)).ok).toBe(false);
    expect(await tokenError(refresh(w, t.refresh_token))).toBe('invalid_grant');
  });

  it('ignores unknown tokens and tokens of another client', async () => {
    const w = oauthWorld();
    const t = await exchange(w, await approveCode(w));
    await expect(w.tokens.revoke({ token: 'nonsense' })).resolves.toBeUndefined();
    await w.tokens.revoke({ token: t.refresh_token, client_id: 'someone-else' });
    expect((await w.access.verify(t.access_token, NOW)).ok).toBe(true);
    expect(await tokenError(w.tokens.revoke({}))).toBe('invalid_request');
  });

  it('lists live grants for the owner only, and revoke kills every token', async () => {
    const w = oauthWorld();
    const t = await exchange(w, await approveCode(w));
    const list = await w.apps.list(owner());
    expect(list.items).toEqual([
      expect.objectContaining({
        client_name: 'Claude',
        client_host: 'claude.example',
        unverified: false,
        scopes: ['envelopes:read', 'envelopes:write'],
      }),
    ]);
    expect((await w.apps.list(owner(30, OTHER))).items).toEqual([]);
    const id = list.items[0]?.id ?? '';
    await expect(w.apps.revoke(owner(30, OTHER), id)).rejects.toThrow('connected_app_not_found');
    await expect(w.apps.revoke(owner(), id)).resolves.toEqual({ revoked: true });
    expect((await w.access.verify(t.access_token, NOW)).ok).toBe(false);
    expect(await tokenError(refresh(w, t.refresh_token))).toBe('invalid_grant');
    expect((await w.apps.list(owner())).items).toEqual([]);
    await expect(w.apps.revoke(owner(), id)).rejects.toThrow('connected_app_not_found');
  });
});
