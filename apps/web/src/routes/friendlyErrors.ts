/**
 * User-facing copy for errors from the document and template routes. Each
 * message says what happened and what to do next, and never leaks raw
 * internals (stack traces, "Request failed with status code 500").
 */

const NETWORK_RE =
  /failed to fetch|fetch failed|network ?error|NetworkError|ERR_NETWORK|ECONN|ENOTFOUND|getaddrinfo/i;

/**
 * Map a raw send-flow error to user-friendly copy. The previous
 * implementation surfaced `err.message` directly, which exposed
 * internals like "fetch failed" / "AbortError" / stack traces to the
 * user. Map the common shapes we know about — network failures,
 * timeouts, abort — to friendlier text and fall back to a generic
 * "Something went wrong" line for everything else. Audit A ·
 * DocumentRoute L-21.
 */
export function friendlySendError(err: unknown): string {
  if (!(err instanceof Error)) return 'Unable to send the document. Please try again.';
  const msg = err.message;
  // Browser fetch / undici network failures.
  if (NETWORK_RE.test(msg)) {
    return "Couldn't reach the Seald servers. Check your connection and try again.";
  }
  // Axios / native timeout shapes.
  if (/timeout|timed out|ETIMEDOUT/i.test(msg)) {
    return 'The request timed out while sending. Try again in a moment.';
  }
  // Abort (user-cancelled or controller.abort()).
  if (err.name === 'AbortError' || /abort(ed)?/i.test(msg)) {
    return 'The send was cancelled before it finished. Try again.';
  }
  // Final fallback — never leak stack traces. If the message looks
  // like internal noise (contains parentheses with line numbers, etc.),
  // swap it for the generic copy.
  if (/\bat\s+\w+\s+\(/.test(msg) || /status code \d+/i.test(msg) || msg.length > 200) {
    return 'Unable to send the document. Please try again.';
  }
  return msg;
}

/**
 * Saving a template failed. The dialog / editor keeps what the user did, so
 * the copy says so and points at the likely fix.
 */
export function friendlyTemplateSaveError(err: unknown): string {
  const msg = err instanceof Error ? err.message : '';
  if (NETWORK_RE.test(msg)) {
    return "Couldn't reach the Seald servers. Check your connection and try again; your layout is still here.";
  }
  return 'Your layout is still here. Try again in a moment.';
}
