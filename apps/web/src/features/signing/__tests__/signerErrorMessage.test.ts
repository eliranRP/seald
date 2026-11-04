import { describe, expect, it } from 'vitest';
import { translate } from '@/lib/i18n/useT';
import { signerErrorMessage } from '../signerErrorMessage';

const FALLBACK = 'We could not save that. Please try again.';

function apiError(message: string, status?: number): Error {
  return Object.assign(new Error(message), status === undefined ? {} : { status });
}

describe('signerErrorMessage', () => {
  it('reads a request that never reached the API as a connection problem', () => {
    expect(signerErrorMessage(apiError('Network Error'), FALLBACK, translate)).toBe(
      "We couldn't reach Seald. Check your connection and try again.",
    );
  });

  it('hides server faults, status phrases and slugs behind the caller copy', () => {
    expect(signerErrorMessage(apiError('boom', 500), FALLBACK, translate)).toBe(FALLBACK);
    expect(signerErrorMessage(apiError('Bad Request', 400), FALLBACK, translate)).toBe(FALLBACK);
    expect(signerErrorMessage(apiError('terms_not_accepted', 409), FALLBACK, translate)).toBe(
      FALLBACK,
    );
    expect(signerErrorMessage(apiError('', 400), FALLBACK, translate)).toBe(FALLBACK);
    expect(signerErrorMessage(null, FALLBACK, translate)).toBe(FALLBACK);
  });

  it('keeps a readable message the API wrote for people', () => {
    expect(
      signerErrorMessage(apiError('This envelope is no longer open.', 409), FALLBACK, translate),
    ).toBe('This envelope is no longer open.');
  });
});
