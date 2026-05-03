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
}
