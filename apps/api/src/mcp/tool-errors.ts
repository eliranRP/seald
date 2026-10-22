import { HttpException, HttpStatus } from '@nestjs/common';
import type { McpToolError } from 'shared';

type NextStep = McpToolError['next_steps'][number];

/**
 * A tool failure with an explicit slug. Services throw `HttpException`
 * with the slug `HttpExceptionFilter` returns as `{ error }`; tools throw
 * this when there is no HTTP equivalent (`insufficient_scope`).
 */
export class McpToolFailure extends Error {
  constructor(
    readonly slug: string,
    readonly options: {
      readonly retryable?: boolean;
      readonly retry_after_seconds?: number;
      readonly next_steps?: readonly NextStep[];
    } = {},
  ) {
    super(slug);
    this.name = 'McpToolFailure';
  }
}

/**
 * Fixed sentences per slug. Never interpolated: document titles, names
 * and file names are data and stay in data fields (Untrusted document text).
 */
const MESSAGES: Readonly<Record<string, string>> = {
  insufficient_scope: 'This API key does not have the scope this tool needs.',
  validation_error: 'The arguments do not match the tool input schema.',
  invalid_cursor: 'The cursor is not valid. Start again without a cursor.',
  envelope_not_found: 'No envelope with this id was found for this account.',
  document_not_found: 'No document with this id was found on this envelope.',
  file_not_ready: 'That file is not available yet.',
  remind_throttled: 'This signer was reminded less than an hour ago.',
  rate_limited: 'Too many requests. Wait and try again.',
  internal_error: 'Something went wrong on the Seald side.',
};

function messageFor(slug: string, status: number): string {
  const known = MESSAGES[slug];
  if (known) return known;
  if (status === HttpStatus.NOT_FOUND) return 'The requested item was not found.';
  if (status === HttpStatus.CONFLICT) return 'The envelope is not in a state that allows this.';
  if (status >= 500) return MESSAGES.internal_error ?? 'Something went wrong.';
  return 'The request could not be completed.';
}

/** Same slug extraction as `HttpExceptionFilter`. */
export function httpExceptionSlug(err: HttpException): string {
  const body = err.getResponse();
  const raw =
    typeof body === 'string'
      ? body
      : ((body as { message?: string | string[] }).message ?? 'error');
  return Array.isArray(raw) ? raw.join('; ') : raw;
}

export function toolError(
  slug: string,
  opts: {
    readonly status?: number;
    readonly retryable?: boolean;
    readonly retry_after_seconds?: number;
    readonly next_steps?: readonly NextStep[];
  } = {},
): McpToolError {
  const status = opts.status ?? HttpStatus.BAD_REQUEST;
  return {
    slug,
    message: messageFor(slug, status),
    retryable: opts.retryable ?? (status === HttpStatus.TOO_MANY_REQUESTS || status >= 500),
    ...(opts.retry_after_seconds !== undefined
      ? { retry_after_seconds: opts.retry_after_seconds }
      : {}),
    next_steps: [...(opts.next_steps ?? [])],
  };
}

/**
 * Map a thrown value to a tool error, or null when it is not an expected
 * failure (the caller then answers `internal_error`).
 */
export function mapToolFailure(err: unknown, args: Record<string, unknown>): McpToolError | null {
  if (err instanceof McpToolFailure) {
    return toolError(err.slug, {
      ...(err.options.retryable !== undefined ? { retryable: err.options.retryable } : {}),
      ...(err.options.retry_after_seconds !== undefined
        ? { retry_after_seconds: err.options.retry_after_seconds }
        : {}),
      ...(err.options.next_steps ? { next_steps: err.options.next_steps } : {}),
    });
  }
  if (err instanceof HttpException) {
    const status = err.getStatus();
    if (status >= 500) return null;
    const slug = httpExceptionSlug(err);
    const envelopeId = typeof args['envelope_id'] === 'string' ? args['envelope_id'] : undefined;
    if (slug === 'file_not_ready' && envelopeId !== undefined) {
      // Sealing may still be running; status says when it is done.
      return toolError(slug, {
        status,
        retryable: true,
        next_steps: [{ tool: 'envelopes_status', args: { envelope_id: envelopeId } }],
      });
    }
    return toolError(slug, { status });
  }
  return null;
}
