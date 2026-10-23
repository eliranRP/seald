import { describe, expect, it } from 'vitest';
import { describeActivity, envelopePath, formatWhen, keyLabel, OUTCOME_LABEL } from './model';
import { fakeActivity } from './fixtures';

describe('agent activity model', () => {
  it('says what was done for a finished row and what was asked for any other', () => {
    expect(describeActivity({ tool: 'envelopes_send', outcome: 'done' })).toBe(
      'Sent for signature',
    );
    expect(describeActivity({ tool: 'envelopes_send', outcome: 'waiting' })).toBe(
      'Asked to send for signature',
    );
    expect(describeActivity({ tool: 'envelopes_fix_signer', outcome: 'denied' })).toBe(
      'Asked to correct a signer',
    );
    expect(describeActivity({ tool: 'envelopes_change_expiry', outcome: 'done' })).toBe(
      'Changed an expiry',
    );
  });

  it('falls back to the tool id for a tool it has no sentence for', () => {
    expect(describeActivity({ tool: 'envelopes_future_thing', outcome: 'done' })).toBe(
      'envelopes_future_thing',
    );
  });

  it('labels every outcome with a word, so status is never colour alone', () => {
    expect(Object.values(OUTCOME_LABEL).every((w) => w.length > 0)).toBe(true);
    expect(OUTCOME_LABEL.waiting).toBe('Waiting for you');
  });

  it('names the key, and says "A key" when the name was never recorded', () => {
    expect(keyLabel(fakeActivity({ key_name: 'Key 2' }))).toBe('Key 2');
    expect(keyLabel(fakeActivity({ key_name: null }))).toBe('A key');
    expect(keyLabel(fakeActivity({ key_name: '' }))).toBe('A key');
  });

  it('links a row to its document only when it has one', () => {
    expect(envelopePath({ envelope_id: 'abc' })).toBe('/document/abc');
    expect(envelopePath({ envelope_id: null })).toBeNull();
  });

  it('formats the time of a row', () => {
    expect(formatWhen('2026-10-02T12:00:00.123456Z')).toMatch(/Oct\s+2/);
  });
});
