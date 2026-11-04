import type { TFn } from '@/lib/i18n';

interface ApiErrorLike {
  readonly status?: unknown;
  readonly message?: unknown;
}

/**
 * HTTP status phrases and axios defaults that the API client puts in
 * `message` when the response had no body. They name a code, not a fix, so
 * the signer gets the caller's own copy instead.
 */
const MACHINE_MESSAGE =
  /^(network error|request failed.*|bad request|unauthorized|forbidden|not found|conflict|gone|payload too large|unprocessable entity|too many requests|internal server error|bad gateway|service unavailable|gateway timeout|timeout of \d+ms exceeded)$/i;

/** An API slug such as `terms_not_accepted`: meant for code, not for people. */
const SLUG = /^[a-z0-9]+(_[a-z0-9]+)+$/;

/**
 * Signer-facing text for a failed call on the signing page: what happened
 * and what to do (feedback § 6). A request that never reached the API reads
 * as a connection problem; a server fault, a raw status phrase or a slug
 * falls back to the caller's copy; a readable 4xx message from the API is
 * kept, since it is already written for people.
 */
export function signerErrorMessage(err: unknown, fallback: string, t: TFn): string {
  const e = (typeof err === 'object' && err !== null ? err : {}) as ApiErrorLike;
  const status = typeof e.status === 'number' ? e.status : undefined;
  const message = typeof e.message === 'string' ? e.message.trim() : '';
  if (status === undefined && /network error|timeout/i.test(message)) {
    return t('signing.common.network');
  }
  if (status !== undefined && status >= 500) return fallback;
  if (message === '' || MACHINE_MESSAGE.test(message) || SLUG.test(message)) return fallback;
  return message;
}
