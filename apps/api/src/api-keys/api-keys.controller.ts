import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { readAmrSignInAt } from './amr';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { RevokeApiKeyDto } from './dto/revoke-api-key.dto';
import { isMcpSurfaceEnabled } from './mcp-enabled';

/**
 * Session-only key management. Sits next to MeController. A `seald_live_`
 * bearer is not a Supabase JWT, so the global AuthGuard rejects it here.
 */
@Controller('me/api-keys')
export class ApiKeysController {
  constructor(private readonly svc: ApiKeysService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    this.requireFlag();
    return this.svc.list(user);
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateApiKeyDto,
    @Headers('authorization') authorization?: string,
  ) {
    this.requireFlag();
    return this.svc.create(user, body, readAmrSignInAt(authorization));
  }

  @Post(':id/revoke')
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RevokeApiKeyDto,
  ) {
    this.requireFlag();
    return this.svc.revoke(user, id, body.revoked);
  }

  private requireFlag(): void {
    if (!isMcpSurfaceEnabled()) throw new NotFoundException('not_found');
  }
}
