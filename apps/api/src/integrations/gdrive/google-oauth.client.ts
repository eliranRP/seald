import type { GoogleOAuthClient } from './gdrive.service';

/**
 * Minimal `fetch`-based Google OAuth client. Skips the `googleapis` SDK
 * (~250 KB) so the API bundle stays small. The three endpoints we need:
 *   - POST https://oauth2.googleapis.com/token            (code exchange + refresh)
 *   - GET  https://www.googleapis.com/drive/v3/about?fields=user
 *                                                          (email + permissionId)
 *   - POST https://oauth2.googleapis.com/revoke           (revoke at Google)
 *
 * Identity-source note: we deliberately do NOT call
 * https://www.googleapis.com/oauth2/v3/userinfo here. That endpoint
 * requires the `openid email` scopes, which would broaden our consent
 * beyond `https://www.googleapis.com/auth/drive.file` (the
 * scope-minimization contract codified in CLAUDE.md). The Drive API
 * `about.get?fields=user` endpoint is reachable under `drive.file`
 * alone and returns the same identifying fields:
 *   - `user.permissionId`   → stable per-user id (= what userinfo's
 *                              `sub` claim provides; persisted as
 *                              gdrive_accounts.google_user_id)
 *   - `user.emailAddress`   → consenting-account email (gdrive_accounts.google_email)
 *   - `user.displayName`    → unused today, available if the UI ever
 *                              wants a friendlier label
 * This change was forced by the 2026-05-04 prod incident where the
 * userinfo call returned 403 under drive.file scope and the OAuth
 * callback threw `google_oauth_userinfo_failed` → 500.
 *
 * `invalid_grant` from the refresh endpoint is the "user revoked access"
 * signal — surfaced upward so the service maps it to TokenExpiredError.
 */
export class FetchGoogleOAuthClient implements GoogleOAuthClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly redirectUri: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<{
    refreshToken: string;
    accessToken: string;
    expiresAt: number;
    googleUserId: string;
    googleEmail: string;
    scope: string;
  }> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });
    const tokenRes = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw mapOAuthError(text);
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
    };
    if (!tokenJson.refresh_token) {
      throw new Error('google_oauth_no_refresh_token: prompt=consent missing?');
    }
    // Identity lookup under drive.file scope (see header comment for why
    // this is `about.get` and NOT `oauth2/v3/userinfo`).
    const aboutRes = await this.fetchImpl('https://www.googleapis.com/drive/v3/about?fields=user', {
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!aboutRes.ok) throw new Error('google_oauth_about_failed');
    const aboutJson = (await aboutRes.json()) as {
      user: { permissionId: string; emailAddress: string };
    };
    return {
      refreshToken: tokenJson.refresh_token,
      accessToken: tokenJson.access_token,
      expiresAt: Date.now() + tokenJson.expires_in * 1000,
      googleUserId: aboutJson.user.permissionId,
      googleEmail: aboutJson.user.emailAddress,
      scope: tokenJson.scope,
    };
  }

  async refreshAccessToken(
    refreshToken: string,
    signal?: AbortSignal,
  ): Promise<{ accessToken: string; expiresAt: number }> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw mapOAuthError(await res.text());
    const json = (await res.json()) as { access_token: string; expires_in: number };
    return { accessToken: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  }

  async revokeToken(refreshToken: string): Promise<void> {
    const body = new URLSearchParams({ token: refreshToken });
    await this.fetchImpl('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  }
}

function mapOAuthError(payload: string): Error & { code?: string } {
  const err = new Error(`google_oauth_error: ${payload.slice(0, 200)}`) as Error & {
    code?: string;
  };
  if (/invalid_grant/.test(payload)) err.code = 'invalid_grant';
  else if (/access_denied/.test(payload)) err.code = 'oauth-declined';
  return err;
}
