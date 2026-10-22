import { describe, expect, it } from 'vitest';
import { stepStartedText } from './stepStartedText';

const names = new Map([
  ['a', 'Ada'],
  ['b', 'Bo'],
]);

describe('stepStartedText', () => {
  it('names the step and the invited signers', () => {
    expect(stepStartedText({ step: 2, signing_order: 2, signer_ids: ['a', 'b'] }, names)).toBe(
      'Step 2 started — invited Ada, Bo',
    );
  });

  it('skips signers it does not know', () => {
    expect(stepStartedText({ step: 1, signer_ids: ['zzz', 'a'] }, names)).toBe(
      'Step 1 started — invited Ada',
    );
  });

  it('never returns the raw event name for odd metadata', () => {
    expect(stepStartedText({}, names)).toBe('Next signing step started');
    expect(stepStartedText(null, names)).toBe('Next signing step started');
  });
});
