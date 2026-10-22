import { InMemoryApiKeysRepository } from '../../../test/in-memory-api-keys-repository';
import { ApiKeyAuthService, hasScopes } from '../api-key-auth.service';
import { generateApiKey } from '../api-key-secret';

const OWNER = '00000000-0000-0000-0000-00000000000a';
const NOW = new Date('2026-10-22T12:00:00.000Z');
const DAY = 86_400_000;

function setup() {
  const repo = new InMemoryApiKeysRepository();
  const svc = new ApiKeyAuthService(repo);
  const key = generateApiKey();
  const row = repo.seed({
    ownerId: OWNER,
    name: 'Key 2',
    prefix: key.prefix,
    keyHash: key.keyHash,
    scopes: ['envelopes:read', 'envelopes:send'],
    expiresAt: new Date(NOW.getTime() + 30 * DAY).toISOString(),
  });
  return { repo, svc, key, row };
}

describe('ApiKeyAuthService.verify', () => {
  it('returns the owner, key id, scopes and the key snapshot', async () => {
    const { svc, key, row } = setup();
    const result = await svc.verify(key.token, NOW);
    expect(result).toEqual({
      ok: true,
      ownerId: OWNER,
      keyId: row.id,
      scopes: ['envelopes:read', 'envelopes:send'],
      keyName: 'Key 2',
      keyPrefix: key.prefix,
      requireOwnerApproval: true,
      allowNewRecipients: false,
      alwaysRequireSignin: false,
    });
  });

  it.each([undefined, null, ''])('missing token (%p) is missing_token', async (token) => {
    const { svc } = setup();
    expect(await svc.verify(token, NOW)).toEqual({ ok: false, error: 'missing_token' });
  });

  it('rejects anything that does not start with seald_live_, without a lookup', async () => {
    const { svc, repo } = setup();
    const spy = jest.spyOn(repo, 'findByPrefix');
    expect(await svc.verify('eyJhbGciOiJSUzI1NiJ9.e30.sig', NOW)).toEqual({
      ok: false,
      error: 'invalid_token',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('a malformed or bad-checksum key is invalid_token, without a lookup', async () => {
    const { svc, repo, key } = setup();
    const spy = jest.spyOn(repo, 'findByPrefix');
    expect((await svc.verify(key.token.slice(0, -2), NOW)).ok).toBe(false);
    const last = key.token.endsWith('A') ? 'B' : 'A';
    expect(await svc.verify(`${key.token.slice(0, -1)}${last}`, NOW)).toEqual({
      ok: false,
      error: 'invalid_token',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('an unknown prefix is invalid_token', async () => {
    const { svc } = setup();
    expect(await svc.verify(generateApiKey().token, NOW)).toEqual({
      ok: false,
      error: 'invalid_token',
    });
  });

  it('a row with the same prefix but another hash is invalid_token', async () => {
    const { svc, repo, key } = setup();
    const other = generateApiKey();
    repo.rows[0]!.keyHash = other.keyHash;
    expect(await svc.verify(key.token, NOW)).toEqual({ ok: false, error: 'invalid_token' });
  });

  it('revoked is api_key_revoked', async () => {
    const { svc, repo, key, row } = setup();
    await repo.revoke(OWNER, row.id, NOW);
    expect(await svc.verify(key.token, NOW)).toEqual({ ok: false, error: 'api_key_revoked' });
  });

  it('expired (at or past expires_at) is api_key_expired', async () => {
    const { svc, repo, key } = setup();
    repo.rows[0]!.expiresAt = NOW.toISOString();
    expect(await svc.verify(key.token, NOW)).toEqual({ ok: false, error: 'api_key_expired' });
  });

  it('a null expiry fails closed as expired', async () => {
    const { svc, repo, key } = setup();
    repo.rows[0]!.expiresAt = null;
    expect(await svc.verify(key.token, NOW)).toEqual({ ok: false, error: 'api_key_expired' });
  });

  it('a wrong secret never reveals that the prefix is revoked', async () => {
    const { svc, repo, key, row } = setup();
    await repo.revoke(OWNER, row.id, NOW);
    repo.rows[0]!.keyHash = generateApiKey().keyHash;
    expect(await svc.verify(key.token, NOW)).toEqual({ ok: false, error: 'invalid_token' });
  });

  it('drops scope strings that are not in the catalogue', async () => {
    const { svc, repo, key } = setup();
    repo.rows[0]!.scopes = ['envelopes:read', 'god:mode'];
    const result = await svc.verify(key.token, NOW);
    expect(result.ok && result.scopes).toEqual(['envelopes:read']);
  });

  it('updates last_used_at at most once a minute', async () => {
    const { svc, repo, key } = setup();
    await svc.verify(key.token, NOW);
    expect(repo.touchCalls).toBe(1);
    expect(repo.rows[0]!.lastUsedAt).toBe(NOW.toISOString());
    await svc.verify(key.token, new Date(NOW.getTime() + 30_000));
    expect(repo.touchCalls).toBe(1);
    await svc.verify(key.token, new Date(NOW.getTime() + 61_000));
    expect(repo.touchCalls).toBe(2);
  });

  it('a failing last_used_at write does not fail the call', async () => {
    const { svc, repo, key } = setup();
    jest.spyOn(repo, 'touchLastUsed').mockRejectedValueOnce(new Error('db down'));
    expect((await svc.verify(key.token, NOW)).ok).toBe(true);
  });

  it('does not log the presented token', async () => {
    const { svc, repo, key } = setup();
    const logs: string[] = [];
    jest.spyOn(repo, 'touchLastUsed').mockRejectedValueOnce(new Error('db down'));
    const warn = jest
      .spyOn((svc as unknown as { log: { warn: (m: string) => void } }).log, 'warn')
      .mockImplementation((m: string) => {
        logs.push(m);
      });
    await svc.verify(key.token, NOW);
    expect(warn).toHaveBeenCalled();
    expect(logs.join('\n')).not.toContain(key.token.slice(11));
  });
});

describe('ApiKeyAuthService.bearer', () => {
  it('extracts a Bearer value and nothing else', () => {
    expect(ApiKeyAuthService.bearer('Bearer abc')).toBe('abc');
    expect(ApiKeyAuthService.bearer('Basic abc')).toBeNull();
    expect(ApiKeyAuthService.bearer('Bearer a b')).toBeNull();
    expect(ApiKeyAuthService.bearer(undefined)).toBeNull();
  });
});

describe('hasScopes', () => {
  it('requires every scope', () => {
    const p = { scopes: ['envelopes:read'] as const };
    expect(hasScopes(p, ['envelopes:read'])).toBe(true);
    expect(hasScopes(p, ['envelopes:read', 'envelopes:send'])).toBe(false);
  });
});
