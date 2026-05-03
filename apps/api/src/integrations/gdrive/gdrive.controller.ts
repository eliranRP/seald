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

  @Get('oauth/url')
  async consentUrl(@CurrentUser() user: AuthUser): Promise<{ url: string }> {
    this.requireFlag();
    const { state, codeChallenge } = this.stateStore.start(user.id);
    return {
      url: buildConsentUrl({
        clientId: this.config.clientId,
        redirectUri: this.config.redirectUri,
        state,
        codeChallenge,
      }),
    };
  }

  @Get('oauth/callback')
  // The callback is reached via Google's redirect — the user's browser, not
  // an authed JSON caller. We rely on the `state` nonce (single-use, 10
  // min TTL) for CSRF + identity binding.
  async oauthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res({ passthrough: true }) res: { redirect(url: string): void },
  ): Promise<void> {
    this.requireFlag();
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
    res.redirect(`${this.config.appPublicUrl}/settings/integrations?connected=1`);
  }

  @Get('accounts')
  async listAccounts(@CurrentUser() user: AuthUser): Promise<ReadonlyArray<GDriveAccountView>> {
    this.requireFlag();
    const rows = await this.svc.listAccounts(user.id);
    return rows
      .filter((r) => !r.deletedAt)
      .map((r) => ({
        id: r.id,
        email: r.googleEmail,
        connectedAt: r.connectedAt,
        lastUsedAt: r.lastUsedAt,
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
