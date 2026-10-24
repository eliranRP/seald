import { describe, expect, it } from 'vitest';
import type { EnvelopeListItem } from 'shared';
import { STATUS_TONE, signedSummary, statusLine } from './rowModel';

describe('statusLine', () => {
  it('turns status and reason into one sentence', () => {
    expect(statusLine('you', 'Your turn')).toBe('Your turn to sign');
    expect(statusLine('others', 'Hannah')).toBe('Waiting for Hannah');
    expect(statusLine('others', 'Waiting')).toBe('Waiting for signers');
    expect(statusLine('sealed', 'Apr 14')).toBe('Sealed Apr 14');
    expect(statusLine('declined', 'Maya')).toBe('Declined by Maya');
    expect(statusLine('draft', 'Not sent')).toBe('Draft, not sent');
  });
});

describe('STATUS_TONE', () => {
  it('colors only your turn, done and problems', () => {
    expect(STATUS_TONE.you).toBe('accent');
    expect(STATUS_TONE.sealed).toBe('success');
    expect(STATUS_TONE.declined).toBe('danger');
    expect(STATUS_TONE.expired).toBe('danger');
    expect(STATUS_TONE.others).toBe('neutral');
    expect(STATUS_TONE.draft).toBe('neutral');
  });
});

describe('signedSummary', () => {
  const signer = (status: string) => ({ status }) as EnvelopeListItem['signers'][number];
  it('counts completed signers', () => {
    const env = { signers: [signer('completed'), signer('awaiting')] } as EnvelopeListItem;
    expect(signedSummary(env)).toBe('1 of 2 signed');
  });
  it('is null without signers', () => {
    expect(signedSummary({ signers: [] } as unknown as EnvelopeListItem)).toBeNull();
  });
});
