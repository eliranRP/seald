import { describe, it, expect } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins truthy strings with single spaces', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });
  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });
});
