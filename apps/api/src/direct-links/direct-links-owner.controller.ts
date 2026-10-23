import {
  Body,
  type CanActivate,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { DirectLink, DirectLinkWithToken } from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireFlag } from '../common/feature-flag.guard';
import { CreateDirectLinkDto, UpdateDirectLinkDto } from './dto/direct-link.dto';
import { DirectLinksService } from './direct-links.service';

/** Runs before the body pipe, so a dark route is a plain 404, never a 400. */
export class DirectLinksFlagGuard implements CanActivate {
  canActivate(): boolean {
    requireFlag('directLinks');
    return true;
  }
}

/**
 * WP-37 owner routes: the template's one direct link. The token is returned
 * only by create and rotate; it is not stored, so it cannot be read again.
 * Authenticated by the global AuthGuard; 404 while `directLinks` is off.
 */
@Controller('templates/:id/direct-link')
@UseGuards(DirectLinksFlagGuard)
export class DirectLinksOwnerController {
  constructor(private readonly svc: DirectLinksService) {}

  @Get()
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ link: DirectLink | null }> {
    return { link: await this.svc.get(user.id, id) };
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDirectLinkDto,
  ): Promise<DirectLinkWithToken> {
    return this.svc.create(user, id, {
      signer_slot: dto.signer_slot,
      ...(dto.daily_cap !== undefined ? { daily_cap: dto.daily_cap } : {}),
      ...(dto.sender_name !== undefined ? { sender_name: dto.sender_name } : {}),
    });
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDirectLinkDto,
  ): Promise<DirectLink> {
    return this.svc.update(user, id, {
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.signer_slot !== undefined ? { signer_slot: dto.signer_slot } : {}),
      ...(dto.daily_cap !== undefined ? { daily_cap: dto.daily_cap } : {}),
      ...(dto.sender_name !== undefined ? { sender_name: dto.sender_name } : {}),
    });
  }

  @Post('rotate')
  @HttpCode(200)
  rotate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DirectLinkWithToken> {
    return this.svc.rotate(user, id);
  }

  @Delete()
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.svc.revoke(user.id, id);
  }
}
