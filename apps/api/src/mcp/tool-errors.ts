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
      readonly url?: string;
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
  idempotency_conflict:
    'This idempotency_key was already used with different arguments. Use a new key for a new request.',
  idempotency_in_progress:
    'A call with this idempotency_key is still running. Wait, then retry with the same key.',
  envelope_not_draft: 'The envelope is no longer a draft, so it cannot be changed this way.',
  signer_email_taken: 'A signer with this email is already on the envelope.',
  signer_not_in_envelope: 'A field names a signer who is not on this envelope.',
  document_not_in_envelope: 'A field names a document that is not on this envelope.',
  contact_not_found: 'No contact with this id was found for this account.',
  upload_not_found: 'No upload with this id was found for this account.',
  upload_not_complete: 'This upload is not complete yet. Call documents_upload_complete first.',
  upload_already_completed: 'This upload is already complete.',
  upload_already_attached: 'This upload is already attached to an envelope. Upload the file again.',
  upload_not_received: 'Storage has not received the file yet. PUT the bytes to upload_url first.',
  upload_expired: 'This upload has expired. Upload the file again.',
  upload_daily_cap: 'This account reached its daily document upload limit.',
  invalid_base64: 'content_base64 is not valid base64.',
  unsupported_file_type: 'Only PDF and .docx files can be uploaded.',
  file_too_large: 'The file is larger than the 25 MB limit.',
  file_not_pdf: 'The file is not a PDF.',
  file_unreadable: 'The PDF could not be read.',
  conversion_timeout: 'Converting the file took too long. Try again or upload a PDF.',
  conversion_failed: 'The file could not be converted to PDF.',
  'conversion-failed': 'The Drive file could not be converted to PDF.',
  conversion_unavailable: 'File conversion is not available right now. Upload a PDF.',
  too_many_documents: 'The envelope already holds the most documents allowed.',
  last_document: 'The envelope must keep at least one document.',
  document_order_invalid: 'document_ids must list every document of the envelope once.',
  signing_order_invalid: 'signers must list every signer of the envelope once.',
  gdrive_not_connected: 'Google Drive is not connected. The owner connects it once at url.',
  gdrive_account_required: 'Several Drive accounts are connected. Pass account_id.',
  gdrive_account_not_found: 'No connected Drive account with this id was found.',
  gdrive_file_not_picked:
    'Seald cannot read this Drive file. The owner picks it once in Seald at url, then call again.',
  gdrive_share_url_invalid: 'share_url is not a Google Drive or Docs file link.',
  'token-expired': 'The Drive connection expired. The owner reconnects it at url.',
  'unsupported-mime': 'Only PDF, Google Docs and .docx files can be imported from Drive.',
  conversion_pending:
    'A Drive file is still being converted. Poll gdrive_conversion_status, then pass its document_id.',
  job_not_found: 'No conversion job with this id was found for this account.',
  job_not_found_or_terminal: 'No running conversion job with this id was found.',
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
    readonly url?: string;
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
    ...(opts.url !== undefined ? { url: opts.url } : {}),
    next_steps: [...(opts.next_steps ?? [])],
  };
}

/**
 * Upstream and timeout failures a service names on purpose (a converter
 * or Drive being down). Every other 5xx, whatever its message, stays
 * `internal_error`.
 */
const PASS_THROUGH_5XX_SLUGS = new Set([
  'conversion_timeout',
  'conversion_failed',
  'conversion-failed',
  'conversion_unavailable',
  'drive-upstream-error',
]);

/** `retryAfter` (seconds) and `url` a service put on its exception body. */
function exceptionExtras(err: HttpException): { retryAfter?: number; url?: string } {
  const body = err.getResponse();
  if (typeof body !== 'object' || body === null) return {};
  const { retryAfter, url } = body as { retryAfter?: unknown; url?: unknown };
  return {
    ...(typeof retryAfter === 'number' && Number.isInteger(retryAfter) && retryAfter > 0
      ? { retryAfter }
      : {}),
    ...(typeof url === 'string' && /^https?:\/\//.test(url) ? { url } : {}),
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
      ...(err.options.url !== undefined ? { url: err.options.url } : {}),
    });
  }
  if (err instanceof HttpException) {
    const status = err.getStatus();
    const slug = httpExceptionSlug(err);
    if (status >= 500 && !PASS_THROUGH_5XX_SLUGS.has(slug)) return null;
    const extras = exceptionExtras(err);
    const envelopeId = typeof args['envelope_id'] === 'string' ? args['envelope_id'] : undefined;
    if (slug === 'file_not_ready' && envelopeId !== undefined) {
      // Sealing may still be running; status says when it is done.
      return toolError(slug, {
        status,
        retryable: true,
        next_steps: [{ tool: 'envelopes_status', args: { envelope_id: envelopeId } }],
      });
    }
    return toolError(slug, {
      status,
      ...(extras.retryAfter !== undefined ? { retry_after_seconds: extras.retryAfter } : {}),
      ...(extras.url !== undefined ? { url: extras.url } : {}),
    });
  }
  return null;
}
