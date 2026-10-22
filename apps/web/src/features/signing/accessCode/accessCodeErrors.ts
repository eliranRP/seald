import { ACCESS_CODE_POLICY } from 'shared';

/** What the form does about an access-code failure. */
export type AccessCodeFailureKind =
  | 'invalid' // 422: wrong code, attempts remain
  | 'locked' // 423: too many wrong codes
  | 'expired' // 410: older than the lifetime
  | 'not-requested' // 409: no live code
  | 'cooldown' // 429: asked again too soon
  | 'rate-limited' // 429: too many sends this hour
  | 'unavailable' // 503: the server cannot send codes
  | 'session' // 401: the pending session is gone
  | 'generic';

export interface AccessCodeFailure {
  readonly kind: AccessCodeFailureKind;
  readonly message: string;
  /** Seconds before a new code may be requested, when the API said so. */
  readonly retryAfterSeconds: number | null;
}

interface ApiErrorLike {
  readonly status?: unknown;
  readonly code?: unknown;
  readonly retryAfterSeconds?: unknown;
}

function asApiError(err: unknown): ApiErrorLike {
  return typeof err === 'object' && err !== null ? (err as ApiErrorLike) : {};
}

/** True for the API's `428 access_code_required` (submit without the re-check code). */
export function isAccessCodeRequiredError(err: unknown): boolean {
  const { status, code } = asApiError(err);
  return status === 428 || code === 'access_code_required';
}

function minutesText(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? 'about a minute' : `about ${String(minutes)} minutes`;
}

/**
 * Maps an API error to plain-language copy. Keyed on the `{ error: slug }`
 * code first (status 410 and 429 each carry two meanings), then on status.
 * The wording says "emailed one-time code"; it never claims the signer's
 * identity was verified.
 */
export function describeAccessCodeError(err: unknown): AccessCodeFailure {
  const { status, code, retryAfterSeconds } = asApiError(err);
  const retry = typeof retryAfterSeconds === 'number' ? retryAfterSeconds : null;

  if (code === 'access_code_locked' || status === 423) {
    return {
      kind: 'locked',
      message: `Too many incorrect codes. This code no longer works, and after ${String(ACCESS_CODE_POLICY.maxAttempts)} tries a new one is needed. Send a new code to try again.`,
      retryAfterSeconds: null,
    };
  }
  if (code === 'access_code_expired') {
    return {
      kind: 'expired',
      message: 'This code has expired. Send a new code to continue.',
      retryAfterSeconds: null,
    };
  }
  if (code === 'access_code_not_requested' || (status === 409 && code === undefined)) {
    return {
      kind: 'not-requested',
      message: 'There is no active code. Send a new code, then enter it here.',
      retryAfterSeconds: null,
    };
  }
  if (code === 'access_code_invalid' || status === 422) {
    return {
      kind: 'invalid',
      message: 'That code is not right. Check the email and enter the 6 digits again.',
      retryAfterSeconds: null,
    };
  }
  if (code === 'access_code_rate_limited') {
    const wait = retry ?? 3600;
    return {
      kind: 'rate-limited',
      message: `Too many codes were requested. Try again in ${minutesText(wait)}.`,
      retryAfterSeconds: wait,
    };
  }
  if (code === 'access_code_cooldown' || status === 429) {
    const wait = retry ?? ACCESS_CODE_POLICY.resendCooldownSeconds;
    return {
      kind: 'cooldown',
      message: 'A code was just sent. Check your email, or wait to request another one.',
      retryAfterSeconds: wait,
    };
  }
  if (code === 'access_code_unavailable' || status === 503) {
    return {
      kind: 'unavailable',
      message: 'Emailed codes are not available right now. Try again later, or ask the sender.',
      retryAfterSeconds: null,
    };
  }
  if (status === 401) {
    return {
      kind: 'session',
      message: 'This page timed out. Open the signing link in your email again.',
      retryAfterSeconds: null,
    };
  }
  return {
    kind: 'generic',
    message: 'Something went wrong. Try again in a moment.',
    retryAfterSeconds: null,
  };
}
