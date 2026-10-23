import { describe, expect, it } from 'vitest';
import {
  expiresInLabel,
  failureCopy,
  keyLine,
  reviewPathFromUrl,
  signInPathFor,
  sortRecipients,
  splitRecipients,
} from './model';
import { APPROVAL_ID, KNOWN_RECIPIENTS, MANY_RECIPIENTS, NEW_RECIPIENT } from './fixtures';

describe('recipients', () => {
  it('puts new addresses first and keeps the server order otherwise', () => {
    const sorted = sortRecipients([...KNOWN_RECIPIENTS, NEW_RECIPIENT]);
    expect(sorted.map((r) => r.email)).toEqual([
      'linus@example.test',
      'ada@example.test',
      'grace@example.test',
    ]);
  });

  it('shows three, then the rest as hidden', () => {
    const { shown, hidden } = splitRecipients(MANY_RECIPIENTS);
    expect(shown).toHaveLength(3);
    expect(shown[0]?.is_new).toBe(true);
    expect(hidden).toHaveLength(2);
  });

  it('hides nothing for three or fewer', () => {
    expect(splitRecipients(KNOWN_RECIPIENTS).hidden).toEqual([]);
  });
});

describe('expiresInLabel', () => {
  const now = new Date('2026-10-22T10:00:00.000Z');
  it.each([
    ['2026-10-23T09:30:00.000Z', 'Expires in 23h'],
    ['2026-10-22T10:40:00.000Z', 'Expires in 40m'],
    ['2026-10-22T09:59:00.000Z', 'Expired'],
    ['not a date', 'Expired'],
  ])('%s reads %s', (iso, label) => {
    expect(expiresInLabel(iso, now)).toBe(label);
  });
});

describe('keyLine', () => {
  it('prefixes a key name and leaves "Sent via API key" whole', () => {
    expect(keyLine('Key 2')).toBe('Sent via Key 2');
    expect(keyLine('Sent via API key')).toBe('Sent via API key');
  });
});

describe('failureCopy', () => {
  it('maps a known slug and falls back for an unknown one', () => {
    expect(failureCopy('api_key_revoked')).toMatch(/revoked/);
    expect(failureCopy('something_new')).toMatch(/did not go through/);
    expect(failureCopy(null)).toMatch(/did not go through/);
  });
});

describe('review paths', () => {
  it('keeps only the path of a same-origin approval review URL', () => {
    expect(reviewPathFromUrl(`${window.location.origin}/approve/${APPROVAL_ID}/review`)).toBe(
      `/approve/${APPROVAL_ID}/review`,
    );
  });

  it.each([
    ['another origin', `https://evil.example/approve/${APPROVAL_ID}/review`],
    ['another path', `${window.location.origin}/documents`],
    ['nothing', undefined],
  ])('refuses %s', (_label, url) => {
    expect(reviewPathFromUrl(url)).toBeNull();
  });

  it('builds a sign-in path with ?next= only for an approval path', () => {
    expect(signInPathFor(`/approve/${APPROVAL_ID}/review?page=2`)).toBe(
      `/signin?next=${encodeURIComponent(`/approve/${APPROVAL_ID}/review?page=2`)}`,
    );
    expect(signInPathFor('/settings/approvals')).toBe('/signin');
  });
});
