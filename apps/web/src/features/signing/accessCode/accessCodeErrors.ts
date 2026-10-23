import { ACCESS_CODE_POLICY } from 'shared';
import { translate } from '@/lib/i18n/useT';
import type { TFn } from '@/lib/i18n/useT';

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

function minutesText(seconds: number, t: TFn): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1
    ? t('signing.accessCode.error.minuteOne')
    : t('signing.accessCode.error.minutesMany', { minutes });
}

/**
 * Maps an API error to plain-language copy. Keyed on the `{ error: slug }`
 * code first (status 410 and 429 each carry two meanings), then on status.
 * The wording says "emailed one-time code"; it never claims the signer's
 * identity was verified.
 */
export function describeAccessCodeError(err: unknown, t: TFn = translate): AccessCodeFailure {
  const { status, code, retryAfterSeconds } = asApiError(err);
  const retry = typeof retryAfterSeconds === 'number' ? retryAfterSeconds : null;

  if (code === 'access_code_locked' || status === 423) {
    return {
      kind: 'locked',
      message: t('signing.accessCode.error.locked', {
        maxAttempts: ACCESS_CODE_POLICY.maxAttempts,
      }),
      retryAfterSeconds: null,
    };
  }
  if (code === 'access_code_expired') {
    return {
      kind: 'expired',
      message: t('signing.accessCode.error.expired'),
      retryAfterSeconds: null,
    };
  }
  if (code === 'access_code_not_requested' || (status === 409 && code === undefined)) {
    return {
      kind: 'not-requested',
      message: t('signing.accessCode.error.notRequested'),
      retryAfterSeconds: null,
    };
  }
  if (code === 'access_code_invalid' || status === 422) {
    return {
      kind: 'invalid',
      message: t('signing.accessCode.error.invalid'),
      retryAfterSeconds: null,
    };
  }
  if (code === 'access_code_rate_limited') {
    const wait = retry ?? 3600;
    return {
      kind: 'rate-limited',
      message: t('signing.accessCode.error.rateLimited', { wait: minutesText(wait, t) }),
      retryAfterSeconds: wait,
    };
  }
  if (code === 'access_code_cooldown' || status === 429) {
    const wait = retry ?? ACCESS_CODE_POLICY.resendCooldownSeconds;
    return {
      kind: 'cooldown',
      message: t('signing.accessCode.error.cooldown'),
      retryAfterSeconds: wait,
    };
  }
  if (code === 'access_code_unavailable' || status === 503) {
    return {
      kind: 'unavailable',
      message: t('signing.accessCode.error.unavailable'),
      retryAfterSeconds: null,
    };
  }
  if (status === 401) {
    return {
      kind: 'session',
      message: t('signing.accessCode.error.session'),
      retryAfterSeconds: null,
    };
  }
  return {
    kind: 'generic',
    message: t('signing.accessCode.error.generic'),
    retryAfterSeconds: null,
  };
}
