import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { ApiKeyListResponse, CreateApiKeyResponse, RevokeApiKeyResponse } from 'shared';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { ApiKeysService } from './api-keys.service';

/**
 * `GET/POST /me/api-keys` and `POST /me/api-keys/:id/revoke`
 * (docs/design/mcp-server.md § Settings UI). Next to `MeController`,
 * which stays export + delete.
 *
 * Supabase session only: the global `AuthGuard` accepts a Supabase JWT
 * and nothing else, so an API key here is 401 and a leaked key cannot
 * mint another key. `ApiKeysFlagMiddleware` 404s every route, before
 * auth, when both `mcpServer` and `publicApi` are off.
 *
 * The body is validated with the shared Zod contract inside the service
 * (`unknown` keeps the class-validator pipe out of the way).
 */
@Controller('me/api-keys')
export class ApiKeysController {
  constructor(private readonly svc: ApiKeysService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthUser): Promise<ApiKeyListResponse> {
    return this.svc.list(user);
  }

  @Post()
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @Throttle({ short: { limit: 5, ttl: 60_000 }, long: { limit: 30, ttl: 3_600_000 } })
  create(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<CreateApiKeyResponse> {
    return this.svc.create(user, body);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RevokeApiKeyResponse> {
    return this.svc.revoke(user, id);
  }
}
