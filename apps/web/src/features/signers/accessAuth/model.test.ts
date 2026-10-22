import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ACCESS_AUTH,
  isDefaultAccessAuth,
  overrideOf,
  reconcileAccessAuth,
  setOverride,
  toAccessAuthRequest,
} from './model';

const IDS = new Map([
  ['a', 'srv-a'],
  ['b', 'srv-b'],
]);

describe('access auth model', () => {
  it('sends nothing for the default choice', () => {
    expect(isDefaultAccessAuth(DEFAULT_ACCESS_AUTH)).toBe(true);
    expect(toAccessAuthRequest(DEFAULT_ACCESS_AUTH, IDS)).toBeNull();
  });

  it('maps the envelope switches to methods', () => {
    expect(toAccessAuthRequest({ access: true, action: false, overrides: {} }, IDS)).toEqual({
      access_auth: 'email_otp',
      action_auth: 'none',
    });
  });

  it('maps overrides to server ids; inherit becomes null', () => {
    const value = setOverride(DEFAULT_ACCESS_AUTH, 'a', { access: 'on' });
    expect(toAccessAuthRequest(value, IDS)).toEqual({
      access_auth: 'none',
      action_auth: 'none',
      signers: [{ signer_id: 'srv-a', access_auth: 'email_otp', action_auth: null }],
    });
  });

  it('skips an override whose signer has no server id', () => {
    const value = setOverride({ ...DEFAULT_ACCESS_AUTH, access: true }, 'zzz', { action: 'off' });
    expect(toAccessAuthRequest(value, IDS)).toEqual({
      access_auth: 'email_otp',
      action_auth: 'none',
    });
  });

  it('removes an override that goes back to inherit on both', () => {
    const on = setOverride(DEFAULT_ACCESS_AUTH, 'a', { access: 'on' });
    expect(overrideOf(on, 'a')).toEqual({ access: 'on', action: 'inherit' });
    const back = setOverride(on, 'a', { access: 'inherit' });
    expect(back.overrides).toEqual({});
  });

  it('drops overrides of removed signers and keeps the same value when nothing changed', () => {
    const value = setOverride(setOverride(DEFAULT_ACCESS_AUTH, 'a', { access: 'on' }), 'b', {
      action: 'off',
    });
    expect(reconcileAccessAuth(value, ['a', 'b'])).toBe(value);
    expect(Object.keys(reconcileAccessAuth(value, ['b']).overrides)).toEqual(['b']);
  });
});
