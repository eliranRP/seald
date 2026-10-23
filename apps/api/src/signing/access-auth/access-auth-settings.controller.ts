import {
  Body,
  type CanActivate,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import type { AccessAuthSettings } from 'shared';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { requireFlag } from '../../common/feature-flag.guard';
import { AccessAuthService } from './access-auth.service';
import { PatchAccessAuthDto } from './dto/patch-access-auth.dto';

/** Runs before the body pipe, so a dark route is a plain 404, never a 400. */
class AccessAuthFlagGuard implements CanActivate {
  canActivate(): boolean {
    requireFlag('signerAccessAuth');
    return true;
  }
}

/**
 * WP-10 — the sender requires an emailed one-time code per envelope
 * (default for every signer) and optionally per signer (override; `null`
 * inherits). Drafts only. 404 while `signerAccessAuth` is off. Thin
 * adapter over AccessAuthService (MCP-first rule 2).
 */
@Controller('envelopes')
@UseGuards(AccessAuthFlagGuard)
export class AccessAuthSettingsController {
  constructor(private readonly svc: AccessAuthService) {}

  @Get(':id/access-auth')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AccessAuthSettings> {
    return this.svc.getSettings(user.id, id);
  }

  @Patch(':id/access-auth')
  patch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchAccessAuthDto,
  ): Promise<AccessAuthSettings> {
    return this.svc.patchSettings(user.id, id, {
      ...(dto.access_auth !== undefined ? { access_auth: dto.access_auth } : {}),
      ...(dto.action_auth !== undefined ? { action_auth: dto.action_auth } : {}),
      ...(dto.signers !== undefined
        ? {
            signers: dto.signers.map((s) => ({
              signer_id: s.signer_id,
              ...(s.access_auth !== undefined ? { access_auth: s.access_auth } : {}),
              ...(s.action_auth !== undefined ? { action_auth: s.action_auth } : {}),
            })),
          }
        : {}),
    });
  }
}
