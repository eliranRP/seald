export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
  readonly provider: string | null;
  /**
   * Unix seconds of the newest `amr[].timestamp` in the Supabase JWT: the
   * last real sign-in. A token refresh changes `iat` but not this, which
   * is why fresh-login checks (API keys with `envelopes:send`) read it.
   * Null or absent when the token carries no usable `amr`.
   */
  readonly lastSignInAt?: number | null;
}
