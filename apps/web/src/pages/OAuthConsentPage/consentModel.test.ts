import { beforeEach, describe, expect, it } from 'vitest';
import type { OAuthAuthorizationRequest } from 'shared';
import { clearStashedRequest, readStashedRequest, stashRequest } from './consentModel';

const REQUEST: OAuthAuthorizationRequest = {
  response_type: 'code',
  client_id: 'claude-test',
  redirect_uri: 'https://claude.example/api/mcp/auth_callback',
  code_challenge: 'c'.repeat(43),
  code_challenge_method: 'S256',
  scope: 'envelopes:read',
  state: 'xyz',
};

const KEY = 'seald.consent.pending';

describe('consent request stash (WP-46)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips the request through this tab for ten minutes', () => {
    stashRequest(REQUEST, 1_000);
    expect(readStashedRequest(1_000 + 10 * 60 * 1000)).toEqual(REQUEST);
  });

  it('stores only the known query keys as one query string', () => {
    const extra = { ...REQUEST, session: 'not-ours' } as OAuthAuthorizationRequest;
    stashRequest(extra, 1_000);
    const stored = JSON.parse(window.sessionStorage.getItem(KEY) ?? '{}') as { q?: string };
    expect(Object.keys(stored).sort()).toEqual(['at', 'q']);
    expect(new URLSearchParams(stored.q).has('session')).toBe(false);
    expect(new URLSearchParams(stored.q).get('client_id')).toBe('claude-test');
  });

  it('drops an expired entry when it is read', () => {
    stashRequest(REQUEST, 1_000);
    expect(readStashedRequest(1_000 + 10 * 60 * 1000 + 1)).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('drops an unreadable entry when it is read', () => {
    window.sessionStorage.setItem(KEY, '{not json');
    expect(readStashedRequest()).toBeNull();
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it('clears on request', () => {
    stashRequest(REQUEST);
    clearStashedRequest();
    expect(readStashedRequest()).toBeNull();
  });
});
