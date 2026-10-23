import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_SETTINGS } from 'shared';
import { applyPatch } from './userSettingsApi';

describe('applyPatch', () => {
  it('merges nested notify and keeps untouched fields', () => {
    const next = applyPatch(DEFAULT_USER_SETTINGS, { notify: { daily_summary: true } });
    expect(next.notify).toEqual({ signed: true, daily_summary: true });
    expect(next.reminder_default).toBe('3d');
  });

  it('applies the defaults it is given', () => {
    const next = applyPatch(DEFAULT_USER_SETTINGS, {
      reminder_default: 'off',
      expiry_default_days: 7,
    });
    expect(next.reminder_default).toBe('off');
    expect(next.expiry_default_days).toBe(7);
  });

  it('clears the image when the signature goes back to typed, like the API', () => {
    const drawn = applyPatch(DEFAULT_USER_SETTINGS, {
      signature: { type: 'drawn', image: 'data:image/png;base64,AAAA' },
    });
    expect(drawn.signature.image).not.toBeNull();
    const typed = applyPatch(drawn, { signature: { type: 'typed' } });
    expect(typed.signature.image).toBeNull();
  });

  it('can null out the name and initials', () => {
    const named = applyPatch(DEFAULT_USER_SETTINGS, { display_name: 'A', initials: 'A' });
    const cleared = applyPatch(named, { display_name: null, initials: null });
    expect(cleared.display_name).toBeNull();
    expect(cleared.initials).toBeNull();
  });
});
