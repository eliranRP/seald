/**
 * Storage path of the stamped, PAdES-sealed copy of a declined, expired or
 * canceled envelope (WP-01). Written by the `audit_only` job in
 * SealingService; served by `GET /envelopes/:id/download?kind=declined`.
 * Kept in its own import-free file so the envelopes module can use it
 * without importing the sealing service.
 */
export function declinedPdfPath(envelope_id: string): string {
  return `${envelope_id}/declined.pdf`;
}
