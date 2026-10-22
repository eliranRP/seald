/**
 * True for the API's `409 not_your_turn` (WP-05): a signer opened their link
 * before the signing step they belong to was invited. Works on the
 * `ApiError` the signer axios client throws (`status` + `message`).
 */
export function isNotYourTurnError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { status, message } = err as { readonly status?: unknown; readonly message?: unknown };
  return status === 409 && message === 'not_your_turn';
}
