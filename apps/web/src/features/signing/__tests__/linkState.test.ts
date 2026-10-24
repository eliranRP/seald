import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLinkHints,
  hintsFromError,
  isLinkStateKey,
  linkStateFor,
  readLinkHints,
  stashLinkHints,
} from '../linkState';

describe('linkStateFor', () => {
  it('maps each API reason to its screen', () => {
    expect(linkStateFor({ status: 409, reason: 'already_signed' })).toBe('signed');
    expect(linkStateFor({ status: 409, reason: 'declined' })).toBe('declined');
    expect(linkStateFor({ status: 410, reason: 'expired' })).toBe('expired');
    expect(linkStateFor({ status: 410, reason: 'canceled' })).toBe('withdrawn');
    expect(linkStateFor({ status: 409, reason: 'not_your_turn' })).toBe('notyet');
  });

  it('reads not_your_turn from the error slug of an older API', () => {
    expect(linkStateFor({ status: 409, code: 'not_your_turn' })).toBe('notyet');
    expect(linkStateFor({ status: 409, message: 'not_your_turn' })).toBe('notyet');
  });

  it('sends bad and unknown links to the invalid screen', () => {
    for (const status of [400, 401, 404, 409, 410]) {
      expect(linkStateFor({ status })).toBe('invalid');
    }
  });

  it('leaves a rate limit and server trouble to the retry copy', () => {
    expect(linkStateFor({ status: 429 })).toBeNull();
    expect(linkStateFor({ status: 500 })).toBeNull();
    expect(linkStateFor({})).toBeNull();
  });
});

describe('link hints', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('round-trips the known fields and nothing else', () => {
    window.sessionStorage.setItem(
      'seald:sign:link:e1',
      JSON.stringify({ token: 't', sender_name: 'E', evil: 'x', waiting_on: 5 }),
    );
    expect(readLinkHints('e1')).toEqual({ token: 't', sender_name: 'E' });
  });

  it('survives missing and broken storage entries', () => {
    expect(readLinkHints('none')).toEqual({});
    window.sessionStorage.setItem('seald:sign:link:bad', '{not json');
    expect(readLinkHints('bad')).toEqual({});
    window.sessionStorage.setItem('seald:sign:link:arr', '[1]');
    expect(readLinkHints('arr')).toEqual({});
  });

  it('stashes, reads and clears', () => {
    stashLinkHints('e2', { token: 'abc' });
    expect(readLinkHints('e2')).toEqual({ token: 'abc' });
    clearLinkHints('e2');
    expect(readLinkHints('e2')).toEqual({});
  });

  it('builds hints from an API refusal and the token', () => {
    expect(
      hintsFromError(
        { sender_name: 'E', signed_at: '2026-10-21T10:00:00Z', short_code: 'ABC' },
        'tok',
      ),
    ).toEqual({
      token: 'tok',
      sender_name: 'E',
      signed_at: '2026-10-21T10:00:00Z',
      short_code: 'ABC',
    });
    expect(hintsFromError({}, null)).toEqual({});
  });

  it('knows the screen keys', () => {
    expect(isLinkStateKey('expired')).toBe(true);
    expect(isLinkStateKey('nonsense')).toBe(false);
    expect(isLinkStateKey(undefined)).toBe(false);
  });
});
