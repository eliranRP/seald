import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTypedPreference, saveTypedPreference } from './typedPreferences';

const STORAGE_KEY = 'seald:signing:typed:v1';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('typedPreferences', () => {
  it('returns null when nothing is saved', () => {
    expect(getTypedPreference({ email: 'a@b.com', kind: 'signature' })).toBeNull();
  });

  it('round-trips a signature value', () => {
    saveTypedPreference({ email: 'a@b.com', kind: 'signature', value: 'Eliran Azulay' });
    expect(getTypedPreference({ email: 'a@b.com', kind: 'signature' })).toBe('Eliran Azulay');
  });

  it('keeps signature and initials independent for the same user', () => {
    saveTypedPreference({ email: 'a@b.com', kind: 'signature', value: 'Eliran Azulay' });
    saveTypedPreference({ email: 'a@b.com', kind: 'initials', value: 'eaz' });
    expect(getTypedPreference({ email: 'a@b.com', kind: 'signature' })).toBe('Eliran Azulay');
    expect(getTypedPreference({ email: 'a@b.com', kind: 'initials' })).toBe('eaz');
  });

  it('isolates preferences across different emails', () => {
    saveTypedPreference({ email: 'a@b.com', kind: 'signature', value: 'A B' });
    saveTypedPreference({ email: 'c@d.com', kind: 'signature', value: 'C D' });
    expect(getTypedPreference({ email: 'a@b.com', kind: 'signature' })).toBe('A B');
    expect(getTypedPreference({ email: 'c@d.com', kind: 'signature' })).toBe('C D');
  });

  it('treats email case-insensitively', () => {
    saveTypedPreference({ email: 'Eliran@Example.com', kind: 'signature', value: 'EA' });
    expect(getTypedPreference({ email: 'eliran@example.com', kind: 'signature' })).toBe('EA');
    expect(getTypedPreference({ email: '  ELIRAN@EXAMPLE.COM ', kind: 'signature' })).toBe('EA');
  });

  it('is a noop when email is empty', () => {
    saveTypedPreference({ email: '', kind: 'signature', value: 'X' });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getTypedPreference({ email: '', kind: 'signature' })).toBeNull();
  });

  it('clears the per-kind entry when value is empty', () => {
    saveTypedPreference({ email: 'a@b.com', kind: 'signature', value: 'A B' });
    saveTypedPreference({ email: 'a@b.com', kind: 'initials', value: 'AB' });
    saveTypedPreference({ email: 'a@b.com', kind: 'signature', value: '' });
    expect(getTypedPreference({ email: 'a@b.com', kind: 'signature' })).toBeNull();
    expect(getTypedPreference({ email: 'a@b.com', kind: 'initials' })).toBe('AB');
  });

  it('removes the user entry entirely when both kinds are cleared', () => {
    saveTypedPreference({ email: 'a@b.com', kind: 'signature', value: 'A B' });
    saveTypedPreference({ email: 'a@b.com', kind: 'signature', value: '' });
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    expect(parsed['a@b.com']).toBeUndefined();
  });

  it('tolerates corrupt JSON in storage', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not valid json');
    expect(getTypedPreference({ email: 'a@b.com', kind: 'signature' })).toBeNull();
    saveTypedPreference({ email: 'a@b.com', kind: 'signature', value: 'A B' });
    expect(getTypedPreference({ email: 'a@b.com', kind: 'signature' })).toBe('A B');
  });

  it('trims whitespace before saving', () => {
    saveTypedPreference({ email: 'a@b.com', kind: 'signature', value: '   Eliran   ' });
    expect(getTypedPreference({ email: 'a@b.com', kind: 'signature' })).toBe('Eliran');
  });
});
