import { describe, it, expect } from 'vitest';
import { invariant } from './invariant';

describe('invariant', () => {
  it('does nothing when condition is truthy', () => {
    expect(() => invariant(true, 'should not throw')).not.toThrow();
  });
  it('throws an Error with the message when falsy', () => {
    expect(() => invariant(0, 'oops')).toThrowError('Invariant failed: oops');
  });
});
