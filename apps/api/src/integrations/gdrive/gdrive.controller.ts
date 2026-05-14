import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import { isFeatureEnabled } from 'shared';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Public } from '../../auth/public.decorator';
import type { AuthUser } from '../../auth/auth-user';
import { GDriveService } from './gdrive.service';
import { OAuthStateStore, buildConsentUrl } from './oauth-pkce';
import type { GDriveAccountView } from './dto/account.dto';
import { GDriveRateLimiter, RateLimitedError } from './rate-limiter';
import { TokenExpiredError } from './dto/error-codes';

/**
 * OAuth + Drive proxy routes for the Drive integration.
 *
 * Every route is gated behind `feature.gdriveIntegration`. When the flag
 * is off, the controller throws NotFoundException so the routes are
 * indistinguishable from a misconfigured server (no information leakage
 * about the upcoming feature).
 */

export interface GDriveConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly appPublicUrl: string;
  /**
   * Google Cloud API key with the Picker API enabled. Vended to the SPA
   * via `/integrations/gdrive/picker-credentials` so the client can
   * construct a `google.picker.PickerBuilder`. Public-ish (referrer
   * restricted in Google Cloud Console) but kept on the server so the
   * SPA bundle does not bake it in and it can be rotated without a
   * frontend redeploy.
   */
  readonly pickerDeveloperKey: string;
  /**
   * Google Cloud project number (numeric, e.g. `123456789012`). Required
   * by the Picker API for app identification — not a secret, but pulled
   * from env for the same rotation/deploy-decoupling reason as the
   * developer key above.
   */
  readonly pickerAppId: string;
}

export const GDRIVE_CONFIG = Symbol('GDRIVE_CONFIG');
export const GDRIVE_FILES_PROXY = Symbol('GDRIVE_FILES_PROXY');

const SUPPORTED_MIME_FILTERS: ReadonlySet<'pdf' | 'doc' | 'docx' | 'all'> = new Set([
  'pdf',
  'doc',
  'docx',
  'all',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

// Type contract for the WT-A-2 files-proxy implementation. Kept in
// WT-A-1 so the proxy module compiles standalone; the runtime provider
// + the consuming route are added in WT-A-2.
export type FilesProxy = (args: {
  accessToken: string;
  mimeFilter: 'pdf' | 'doc' | 'docx' | 'all';
}) => Promise<{ files: ReadonlyArray<DriveFile> }>;

@Controller('integrations/gdrive')
export class GDriveController {
  constructor(
    private readonly svc: GDriveService,
    @Inject(OAuthStateStore) private readonly stateStore: OAuthStateStore,
    @Inject(GDRIVE_CONFIG) private readonly config: GDriveConfig,
    @Inject(GDriveRateLimiter) private readonly rateLimiter: GDriveRateLimiter,
    @Inject(GDRIVE_FILES_PROXY) private readonly filesProxy: FilesProxy,
  ) {}

  private requireFlag(): void {
    if (!isFeatureEnabled('gdriveIntegration')) {
      throw new NotFoundException('not_found');
    }
  }

  /**
   * Fail loudly when the OAuth env vars are missing. The module factory
   * falls back to empty strings so the api can boot dark (flag-off
   * scenario), but once the flag is ON every OAuth route MUST have a
   * real client id + secret. Without this check, `consentUrl` happily
   * returned a Google URL with `client_id=` and the user got a confusing
   * "Missing required parameter: client_id" error from Google. Mirrors
   * the GDriveKmsService stubFail pattern in `gdrive.module.ts`.
   */
  private requireOAuthConfigured(): void {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new HttpException('gdrive_oauth_not_configured', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Mirrors `requireOAuthConfigured` for the Picker-specific env vars
   * (`GDRIVE_PICKER_DEVELOPER_KEY` + `GDRIVE_PICKER_APP_ID`). The SPA's
   * Path A flow needs both to construct a `google.picker.PickerBuilder`;
   * if either is empty we want a 503 so the frontend can render a
   * deliberate "Drive picker not configured on this server" notice
   * instead of silently building a broken picker call.
   */
  private requirePickerConfigured(): void {
    if (!this.config.pickerDeveloperKey || !this.config.pickerAppId) {
      throw new HttpException(
        { code: 'gdrive_picker_not_configured', message: 'gdrive_picker_not_configured' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('oauth/url')
  async consentUrl(
    @CurrentUser() user: AuthUser,
    @Query('return') returnPath?: string,
  ): Promise<{ url: string }> {
    this.requireFlag();
    this.requireOAuthConfigured();
    // Sanitize returnPath: must start with '/' (relative) to prevent open-redirect.
    const safePath =
      returnPath && returnPath.startsWith('/') && !returnPath.startsWith('//')
        ? returnPath
        : undefined;
    const { state, codeChallenge } = this.stateStore.start(
      user.id,
      safePath ? { returnPath: safePath } : undefined,
    );
    return {
      url: buildConsentUrl({
        clientId: this.config.clientId,
        redirectUri: this.config.redirectUri,
        state,
        codeChallenge,
      }),
    };
  }

  /**
   * Full-page OAuth redirect for mobile browsers (iOS Safari blocks
   * popups). Accepts `?return=<path>` — the SPA path to redirect the
   * user to after the OAuth callback completes. Generates the consent
   * URL server-side and issues a 302 redirect so the browser navigates
   * straight to Google without a round-trip JSON fetch.
   *
   * The `return` path is stored in the OAuth state entry so the callback
   * handler can redirect back to the correct SPA route once the flow
   * completes (instead of the default popup-bridge page).
   */
  @Get('oauth/start')
  async oauthStart(
    @CurrentUser() user: AuthUser,
    @Query('return') returnPath: string | undefined,
    @Res({ passthrough: true }) res: { redirect(url: string): void },
  ): Promise<void> {
    this.requireFlag();
    this.requireOAuthConfigured();
    // Validate the return path: must be a relative SPA path (starts with /)
    // to prevent open-redirect attacks. Strip anything that looks like a
    // protocol or double-slash prefix.
    const opts: { returnPath?: string } = {};
    if (returnPath && /^\/[^/]/.test(returnPath)) {
      opts.returnPath = returnPath;
    }
    const { state, codeChallenge } = this.stateStore.start(user.id, opts);
    const url = buildConsentUrl({
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      state,
      codeChallenge,
    });
    res.redirect(url);
  }

  @Get('oauth/callback')
  @Public()
  // The callback is reached via Google's redirect — the user's browser, not
  // an authed JSON caller. We rely on the `state` nonce (single-use, 10
  // min TTL) for CSRF + identity binding. @Public() opts the route out of
  // the global APP_GUARD AuthGuard, which would otherwise 401 the redirect
  // before requireFlag() even runs (no Supabase JWT on a top-level browser
  // redirect from accounts.google.com).
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res({ passthrough: true }) res: { redirect(url: string): void },
  ): Promise<void> {
    this.requireFlag();
    this.requireOAuthConfigured();
    if (error) {
      throw new HttpException(`oauth-declined: ${error}`, 400);
    }
    const entry = this.stateStore.consume(state);
    if (!entry) {
      throw new BadRequestException('oauth_state_invalid');
    }
    if (!code) throw new BadRequestException('oauth_code_missing');
    await this.svc.completeOAuth({
      userId: entry.userId,
      code,
      codeVerifier: entry.codeVerifier,
    });
    // Bug G (2026-05-04): redirect to the dedicated OAuth callback
    // route mounted OUTSIDE <AppShell />. Landing on
    // /settings/integrations directly tripped AppShell's mobile-redirect
    // rule (≤ 640 px → /m/send) on the 480 × 720 popup, so the popup
    // never closed. The new bridge page handles popup mode (postMessage
    // back to the opener + window.close()) and same-tab fallback
    // (redirects back to /settings/integrations?connected=1).
    //
    // Mobile full-page flow: when the state carries a `returnPath` (set
    // by the `oauth/start` endpoint), redirect directly to that SPA path
    // with `?connected=1` appended. This avoids the popup-bridge page
    // entirely — mobile Safari never opened a popup, so there's nothing
    // to close.
    if (entry.returnPath) {
      const sep = entry.returnPath.includes('?') ? '&' : '?';
      res.redirect(`${this.config.appPublicUrl}${entry.returnPath}${sep}connected=1`);
    } else {
      res.redirect(`${this.config.appPublicUrl}/oauth/gdrive/callback?connected=1`);
    }
  }

  @Get('accounts')
  async listAccounts(@CurrentUser() user: AuthUser): Promise<ReadonlyArray<GDriveAccountView>> {
    this.requireFlag();
    const rows = (await this.svc.listAccounts(user.id)).filter((r) => !r.deletedAt);
    // `tokenStatus` is a CHEAP in-memory read of the most recent refresh
    // outcome (no extra Google round-trip per page load). The flag goes
    // hot when `getAccessToken` (called by /files, /picker-credentials,
    // the export service) trips `invalid_grant` and clears on the next
    // successful refresh or `completeOAuth`. Audit slice C #4 (HIGH).
    return rows.map((r) => ({
      id: r.id,
      email: r.googleEmail,
      connectedAt: r.connectedAt,
      lastUsedAt: r.lastUsedAt,
      tokenStatus: this.svc.getTokenStatus(r.id),
    }));
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  async deleteAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    this.requireFlag();
    await this.svc.revokeAccount(id, user.id);
  }

  /**
   * Server-side proxy over Drive `files.list`. Defence in depth:
   *  - Per-user rate limiting (cache key = `user.id`, NEVER `accountId`,
   *    so rotating accountIds cannot bypass the bucket).
   *  - mimeFilter validated against the allow-list before reaching
   *    `files-proxy.ts` — even though the proxy keys into a `Record`,
   *    rejecting at the edge with `unsupported-mime` keeps the wire
   *    contract honest and prevents a TS-cast bypass.
   *  - Account ownership check (via `svc.getAccessToken` →
   *    `requireOwnedAccount`) — NotFound on mismatch (no existence leak).
   *  - Drive-side errors are mapped to the existing `GDriveErrorCode`
   *    taxonomy; we never echo the upstream error body or the access
   *    token into the response.
   */
  @Get('files')
  async listFiles(
    @CurrentUser() user: AuthUser,
    @Query('accountId') accountId: string,
    @Query('mimeFilter') mimeFilter: 'pdf' | 'doc' | 'docx' | 'all' = 'all',
  ): Promise<{ files: ReadonlyArray<DriveFile> }> {
    this.requireFlag();
    if (!accountId || !UUID_RE.test(accountId)) {
      throw new BadRequestException({
        code: 'invalid-account-id',
        message: 'accountId_must_be_uuid',
      });
    }
    if (!SUPPORTED_MIME_FILTERS.has(mimeFilter)) {
      throw new HttpException(
        { code: 'unsupported-mime', message: 'mime_filter_not_in_allow_list' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      await this.rateLimiter.acquire(user.id);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        throw new HttpException(
          {
            code: 'rate-limited',
            message: 'gdrive_rate_limited',
            retryAfter: Math.ceil(err.retryAfterMs / 1000),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw err;
    }
    // Resolve account → fresh access token. Throws NotFound when the
    // account does not belong to the caller (existence leak guard).
    const { accessToken } = await this.svc.getAccessToken(accountId, user.id);
    try {
      return await this.filesProxy({ accessToken, mimeFilter });
    } catch (err) {
      throw mapDriveError(err);
    }
  }

  /**
   * Vends the credentials the SPA needs to construct a Google Picker UI
   * (`google.picker.PickerBuilder`). Returns:
   *  - `accessToken`: short-lived (~1h) OAuth access token freshly
   *    minted from the user's stored refresh token. Required by Picker
   *    to authenticate the in-iframe Drive UI as the user. The refresh
   *    token NEVER leaves the API — only this short-lived access token.
   *  - `developerKey`: Google Cloud API key with Picker API enabled,
   *    referrer-restricted in Cloud Console. Public-ish but kept
   *    server-side for rotation without a redeploy.
   *  - `appId`: Google Cloud project number; required by the Picker
   *    API for app identification.
   *
   * Defence in depth — same shape as `/files`:
   *  - Feature-flag-gated (404 when off).
   *  - 503 when OAuth or Picker env vars are unset.
   *  - 400 on non-UUID accountId.
   *  - Per-user rate limit (cache key = `user.id`).
   *  - Account ownership check inside `getAccessToken` (NotFound on
   *    mismatch — no existence leak).
   *  - Drive-side errors mapped via the shared `mapDriveError`
   *    (TokenExpired → 401 token-expired, etc).
   */
  @Get('picker-credentials')
  async pickerCredentials(
    @CurrentUser() user: AuthUser,
    @Query('accountId') accountId: string,
  ): Promise<{ accessToken: string; developerKey: string; appId: string }> {
    this.requireFlag();
    this.requireOAuthConfigured();
    this.requirePickerConfigured();
    if (!accountId || !UUID_RE.test(accountId)) {
      throw new BadRequestException({
        code: 'invalid-account-id',
        message: 'accountId_must_be_uuid',
      });
    }
    try {
      await this.rateLimiter.acquire(user.id);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        throw new HttpException(
          {
            code: 'rate-limited',
            message: 'gdrive_rate_limited',
            retryAfter: Math.ceil(err.retryAfterMs / 1000),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw err;
    }
    try {
      const { accessToken } = await this.svc.getAccessToken(accountId, user.id);
      return {
        accessToken,
        developerKey: this.config.pickerDeveloperKey,
        appId: this.config.pickerAppId,
      };
    } catch (err) {
      // Preserve NotFound (account not owned by caller) — that's a
      // controller-level 404, not a Drive-upstream error.
      if (err instanceof NotFoundException) throw err;
      throw mapDriveError(err);
    }
  }
}

function mapDriveError(err: unknown): HttpException {
  if (err instanceof TokenExpiredError) {
    return new HttpException(
      { code: 'token-expired', message: 'reconnect_required' },
      HttpStatus.UNAUTHORIZED,
    );
  }
  if (err instanceof Error) {
    const m = /drive_files_list_failed:\s*(\d{3})/.exec(err.message);
    if (m && m[1]) {
      const status = Number(m[1]);
      if (status === 401) {
        return new HttpException(
          { code: 'token-expired', message: 'reconnect_required' },
          HttpStatus.UNAUTHORIZED,
        );
      }
      if (status === 403) {
        return new HttpException(
          { code: 'oauth-declined', message: 'permission_denied_or_consent_revoked' },
          HttpStatus.FORBIDDEN,
        );
      }
    }
  }
  // Default: opaque 502. Body deliberately omits `err.message` so we
  // never echo a Drive-side body or any upstream-leaked secret.
  return new HttpException(
    { code: 'drive-upstream-error', message: 'drive_request_failed' },
    HttpStatus.BAD_GATEWAY,
  );
}
