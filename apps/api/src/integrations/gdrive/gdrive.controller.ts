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

  // TODO(WT-A-2): rate-limited Drive files proxy lives in follow-up PR
  // (`feature/gdrive-files-proxy`). Stubbed at 501 here so WT-A-1 can
  // ship without dead injection points (no orphan rate-limiter or
  // files-proxy providers in this PR — see decisions.md Phase 5
  // corrected verdict).
  @Get('files')
  listFiles(
    @CurrentUser() _user: AuthUser,
    @Query('accountId') _accountId: string,
    @Query('mimeFilter') _mimeFilter: 'pdf' | 'doc' | 'docx' | 'all' = 'all',
  ): never {
    this.requireFlag();
    throw new HttpException(
      { code: 'not-implemented', message: 'gdrive_files_proxy_pending_wt_a2' },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
