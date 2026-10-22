import { describe, expect, it } from 'vitest';
import { FILL_ERROR_SLUGS, fillErrorMessage, isFillErrorSlug } from './fillErrors';

describe('fillErrorMessage', () => {
  it('has a message for every slug the API can answer', () => {
    for (const slug of FILL_ERROR_SLUGS) {
      const message = fillErrorMessage(slug, {});
      expect(message).not.toBe(slug);
      expect(message.length).toBeGreaterThan(10);
    }
  });

  it('names the character limit', () => {
    expect(fillErrorMessage('field_value_too_long', { char_limit: 12 })).toBe(
      'Use at most 12 characters.',
    );
  });

  it('names the allowed range', () => {
    expect(fillErrorMessage('field_value_out_of_range', { min: 1, max: 10 })).toBe(
      'Enter a number from 1 to 10.',
    );
    expect(fillErrorMessage('field_value_out_of_range', { min: 5 })).toBe(
      'Enter a number of at least 5.',
    );
    expect(fillErrorMessage('field_value_out_of_range', { max: 5 })).toBe(
      'Enter a number of at most 5.',
    );
  });

  it('passes an unknown message through unchanged', () => {
    expect(isFillErrorSlug('Request failed')).toBe(false);
    expect(fillErrorMessage('Request failed', undefined)).toBe('Request failed');
  });
});
