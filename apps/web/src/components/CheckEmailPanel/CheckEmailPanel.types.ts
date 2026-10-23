export type ResendResult = 'ok' | 'rate_limited' | 'error';

export interface CheckEmailPanelProps {
  /** Address the link was sent to. */
  readonly email: string;
  /** Sends a fresh link. The panel restarts its cooldown on success. */
  readonly onResend: () => Promise<ResendResult>;
  /** "Use a different email": the parent returns to the start form. */
  readonly onChangeEmail: () => void;
  /** Seconds before Resend unlocks. Defaults to 30 (Supabase OTP rate limit). */
  readonly cooldownSeconds?: number | undefined;
}
