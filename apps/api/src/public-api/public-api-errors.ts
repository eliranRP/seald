import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { httpExceptionSlug, toolError } from '../mcp/tool-errors';

/**
 * The one error shape of `/api/v1`: `{ error: slug, message }` (plus
 * `retry_after_seconds` and `url` when the slug has them). The slugs are
 * the tool slugs of docs/design/mcp-server.md and `HttpExceptionFilter`'s,
 * so a slug means the same on REST, MCP and the app. `message` is a fixed
 * sentence per slug and never carries document text or signer data.
 */
export interface PublicApiErrorBody {
  readonly error: string;
  readonly message: string;
  readonly retry_after_seconds?: number;
  readonly url?: string;
}

const OWN_MESSAGES: Readonly<Record<string, string>> = {
  missing_token: 'Send the API key as Authorization: Bearer <key>.',
  invalid_token: 'The API key is not valid.',
  api_key_revoked: 'This API key was revoked.',
  api_key_expired: 'This API key expired.',
  not_found: 'The requested item was not found.',
  method_not_allowed: 'That method is not allowed on this path.',
  unsupported_media_type: 'Send a JSON body with Content-Type: application/json.',
};

/** HTTP status per slug. A slug not listed is 404 when it ends in `_not_found`, else 400. */
const STATUS: Readonly<Record<string, number>> = {
  // 401 / 403
  missing_token: 401,
  invalid_token: 401,
  api_key_revoked: 401,
  api_key_expired: 401,
  insufficient_scope: 403,
  send_suspended: 403,
  key_send_suspended: 403,
  email_not_verified: 403,
  // 404 / 405
  not_found: 404,
  method_not_allowed: 405,
  // 409: the request is fine, the resource is in another state
  idempotency_conflict: 409,
  idempotency_in_progress: 409,
  envelope_not_draft: 409,
  envelope_terminal: 409,
  envelope_not_sealed: 409,
  signer_email_taken: 409,
  email_taken: 409,
  file_not_ready: 409,
  already_signed: 409,
  already_declined: 409,
  not_your_turn: 409,
  confirmation_required: 409,
  confirmation_invalid: 409,
  upload_already_completed: 409,
  upload_already_attached: 409,
  upload_not_complete: 409,
  upload_not_received: 409,
  conversion_pending: 409,
  too_many_documents: 409,
  last_document: 409,
  // 413 / 415
  file_too_large: 413,
  unsupported_file_type: 415,
  unsupported_media_type: 415,
  // 422: well-formed, but the envelope cannot be sent as it is
  file_required: 422,
  no_signers: 422,
  no_fields: 422,
  signer_without_signature_field: 422,
  signer_is_account_owner: 422,
  template_has_no_fields: 422,
  template_signer_count_mismatch: 422,
  // 429
  rate_limited: 429,
  remind_throttled: 429,
  send_daily_cap: 429,
  recipient_daily_cap: 429,
  upload_daily_cap: 429,
  approval_limit: 429,
  // 5xx the service names on purpose
  conversion_timeout: 504,
  conversion_failed: 502,
  conversion_unavailable: 503,
  internal_error: 500,
};

export function statusForSlug(slug: string): number {
  const known = STATUS[slug];
  if (known !== undefined) return known;
  return slug.endsWith('_not_found') ? 404 : 400;
}

export function messageForSlug(slug: string): string {
  return OWN_MESSAGES[slug] ?? toolError(slug, { status: statusForSlug(slug) }).message;
}

export function errorBody(
  slug: string,
  extras: { retry_after_seconds?: number; url?: string } = {},
): PublicApiErrorBody {
  return {
    error: slug,
    message: messageForSlug(slug),
    ...(extras.retry_after_seconds !== undefined
      ? { retry_after_seconds: extras.retry_after_seconds }
      : {}),
    ...(extras.url !== undefined ? { url: extras.url } : {}),
  };
}

/** A failure the controller names itself (a malformed body). */
export class PublicApiFailure extends Error {
  constructor(readonly slug: string) {
    super(slug);
    this.name = 'PublicApiFailure';
  }
}

/**
 * Guard and routing errors (a missing key, a dark flag, a throttled burst)
 * in the `/api/v1` shape. Replaces the global filter on these controllers
 * only; every other route keeps `{ error }`.
 */
@Catch()
export class PublicApiExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('PublicApi');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();

    if (exception instanceof PublicApiFailure) {
      res.status(statusForSlug(exception.slug)).json(errorBody(exception.slug));
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      let slug = httpExceptionSlug(exception);
      // Nest's throttler throws `ThrottlerException: Too Many Requests`.
      if (status === 429) slug = 'rate_limited';
      else if (status === 404) slug = 'not_found';
      else if (status === 405) slug = 'method_not_allowed';
      else if (status >= 500) slug = 'internal_error';
      else if (!(slug in STATUS)) slug = 'validation_error';
      if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
      const body = exception.getResponse();
      const retryAfter =
        typeof body === 'object' && body !== null
          ? (body as { retryAfter?: unknown }).retryAfter
          : undefined;
      res
        .status(status)
        .json(
          errorBody(
            slug,
            typeof retryAfter === 'number' ? { retry_after_seconds: retryAfter } : {},
          ),
        );
      return;
    }
    this.log.error(
      `unhandled ${req.method} ${req.path}: ${exception instanceof Error ? exception.name : typeof exception}`,
    );
    res.status(500).json(errorBody('internal_error'));
  }
}
