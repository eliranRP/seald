/**
 * Public-facing account view returned by `GET
 * /integrations/gdrive/accounts`. Strips every column that's an
 * encryption secret (refresh_token_ciphertext, refresh_token_kms_key_arn)
 * — those never leave the backend.
 */
export interface GDriveAccountView {
  readonly id: string;
  readonly email: string;
  readonly connectedAt: string;
  readonly lastUsedAt: string | null;
  /**
   * Health of the stored refresh token. `live` means the most recent
   * refresh attempt succeeded (or the account is fresh and we have no
   * negative signal yet); `reconnect_required` means we observed an
   * `invalid_grant` from Google and the SPA must surface a primary
   * Reconnect button instead of letting the user keep clicking through
   * to a broken Drive picker. Audit slice C #4 (HIGH).
   */
  readonly tokenStatus: GDriveTokenStatus;
}

export type GDriveTokenStatus = 'live' | 'reconnect_required';
