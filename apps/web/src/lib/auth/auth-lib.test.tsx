import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { AuthContext } from '@/providers/AuthProvider';
import type { AuthContextValue } from '@/providers/AuthProvider';
import { isRateLimitError, useSendMagicLink } from './magicLink';
import { readProfileState } from './profileState';

function session(user: Record<string, unknown>): Session {
  return { access_token: 't', user } as unknown as Session;
}

describe('readProfileState', () => {
  const NOW = '2026-05-01T10:00:00.000Z';

  it('treats no session and anonymous guests as nothing to onboard', () => {
    expect(readProfileState(null)).toEqual({ name: '', needsWelcome: false });
    expect(readProfileState(session({ is_anonymous: true }))).toEqual({
      name: '',
      needsWelcome: false,
    });
  });

  it('sends a named account with no name to /welcome', () => {
    const s = session({ is_anonymous: false, user_metadata: {}, created_at: NOW });
    expect(readProfileState(s)).toEqual({ name: '', needsWelcome: true });
  });

  it('lets an existing user with a name straight in', () => {
    const s = session({
      is_anonymous: false,
      user_metadata: { full_name: 'Ada Lovelace' },
      created_at: '2024-01-01T00:00:00.000Z',
      last_sign_in_at: NOW,
    });
    expect(readProfileState(s)).toEqual({ name: 'Ada Lovelace', needsWelcome: false });
  });

  it('sends a first Google sign-in (name but no terms yet) through /welcome, pre-filled', () => {
    const s = session({
      is_anonymous: false,
      user_metadata: { name: 'Hannah Wills' },
      created_at: NOW,
      last_sign_in_at: NOW,
    });
    expect(readProfileState(s)).toEqual({ name: 'Hannah Wills', needsWelcome: true });
  });

  it('does not repeat /welcome once the terms were accepted', () => {
    const s = session({
      is_anonymous: false,
      user_metadata: { full_name: 'Hannah Wills', terms_accepted_at: NOW },
      created_at: NOW,
      last_sign_in_at: NOW,
    });
    expect(readProfileState(s).needsWelcome).toBe(false);
  });
});

describe('isRateLimitError', () => {
  it('recognises HTTP 429 and the Supabase rate-limit codes', () => {
    expect(isRateLimitError({ status: 429 })).toBe(true);
    expect(isRateLimitError({ code: 'over_email_send_rate_limit' })).toBe(true);
    expect(isRateLimitError({ code: 'over_request_rate_limit' })).toBe(true);
  });

  it('ignores other failures', () => {
    expect(isRateLimitError({ status: 400 })).toBe(false);
    expect(isRateLimitError(new Error('boom'))).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError('429')).toBe(false);
  });
});

describe('useSendMagicLink', () => {
  function run(signInWithEmailLink: AuthContextValue['signInWithEmailLink']) {
    const value = { signInWithEmailLink } as unknown as AuthContextValue;
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    );
    return renderHook(() => useSendMagicLink(), { wrapper }).result.current;
  }

  it('resolves ok when the link is sent', async () => {
    const send = vi.fn(async () => undefined);
    await expect(run(send)('a@b.co')).resolves.toBe('ok');
    expect(send).toHaveBeenCalledWith('a@b.co');
  });

  it('maps a 429 to rate_limited and anything else to error', async () => {
    await expect(
      run(async () => {
        throw Object.assign(new Error('slow down'), { status: 429 });
      })('a@b.co'),
    ).resolves.toBe('rate_limited');
    await expect(
      run(async () => {
        throw new Error('smtp down');
      })('a@b.co'),
    ).resolves.toBe('error');
  });
});
