/**
 * Scan with phone (redesign v2, WS-J). A signed-in owner on a computer
 * creates a scan session and shows its code as a QR; the phone captures
 * pages and posts one PDF; the owner's browser downloads it.
 */

/** A session lives this long from creation (the "Link works for 10 min" line). */
export const SCAN_SESSION_TTL_SECONDS = 600;
/** Most pages one scan may hold. */
export const SCAN_MAX_PAGES = 20;
/** Largest PDF the phone may post. */
export const SCAN_MAX_BYTES = 25 * 1024 * 1024;

export type ScanSessionStatus = 'pending' | 'received' | 'expired';

/** `POST /scan-sessions`. */
export interface CreateScanSessionResponse {
  readonly code: string;
  readonly expires_at: string;
}

/** `GET /scan-sessions/:code` (owner). */
export interface ScanSessionView {
  readonly status: ScanSessionStatus;
  readonly expires_at: string;
  readonly page_count: number | null;
}

/** `GET /scan-sessions/:code/phone` (no sign-in): all the phone may learn. */
export interface ScanSessionPhoneView {
  readonly status: ScanSessionStatus;
  readonly expires_at: string;
}

/** `POST /scan-sessions/:code/pdf` (phone). */
export interface ScanSessionUploadResult {
  readonly page_count: number;
}
