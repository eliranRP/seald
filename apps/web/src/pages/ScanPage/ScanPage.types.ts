export interface ScanPageProps {
  /**
   * The scan session code from `/scan/:code` (the phone side). Omit for
   * `/scan`: the signed-in owner's own scanner (phone) or QR dialog (desktop).
   * Tests and stories pass it; the routes leave it to the URL.
   */
  readonly code?: string | undefined;
}

export type PhoneScanState =
  | 'checking'
  | 'ready'
  | 'sent'
  | 'expired'
  | 'used'
  | 'invalid'
  | 'offline';
