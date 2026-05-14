import { describe, expect, it } from 'vitest';
import { friendlySendError } from './DocumentRoute';

/**
 * Regression coverage for PR-7 (audit slice A — Sender):
 *   L-21  Send-flow errors render user-friendly copy instead of the
 *         raw `err.message` (which previously surfaced "fetch failed",
 *         "AbortError", and even stack traces to senders).
 */

describe('DocumentRoute.friendlySendError (PR-7 L-21)', () => {
  it('maps a network error to a connection-failure line', () => {
    expect(friendlySendError(new TypeError('Failed to fetch'))).toMatch(
      /Couldn't reach the Seald servers/i,
    );
  });

  it('maps a timeout error to the timeout copy', () => {
    expect(friendlySendError(new Error('Request timed out after 30000ms'))).toMatch(
      /request timed out/i,
    );
  });

  it('maps an AbortError to the cancellation copy', () => {
    const err = new Error('The user aborted a request.');
    err.name = 'AbortError';
    expect(friendlySendError(err)).toMatch(/cancelled before it finished/i);
  });

  it('falls back to a generic copy when the message looks like a stack trace', () => {
    expect(
      friendlySendError(new Error('TypeError: x is undefined\n    at foo (bar.js:1:1)')),
    ).toMatch(/Unable to send the document/i);
  });

  it('falls back when the value is not an Error at all', () => {
    expect(friendlySendError('some non-Error string')).toMatch(/Unable to send the document/i);
  });

  it('passes through short, message-only errors as-is so server-side hints still show', () => {
    expect(friendlySendError(new Error('Recipient list is empty.'))).toBe(
      'Recipient list is empty.',
    );
  });
});
