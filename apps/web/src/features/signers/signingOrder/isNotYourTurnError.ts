/**
 * True for the API's `409 not_your_turn` (WP-05): a signer opened their link
 * before the signing step they belong to was invited. Works on the
 * `ApiError` the signer axios client throws (`status` + `message`).
 */
export function isNotYourTurnError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { status, message, code } = err as {
    readonly status?: unknown;
    readonly message?: unknown;
    readonly code?: unknown;
  };
  // The API answers `{ error: 'not_your_turn' }`, which the signer client
  // exposes as `code`; `message` covers callers that build the error by hand.
  return status === 409 && (code === 'not_your_turn' || message === 'not_your_turn');
}
