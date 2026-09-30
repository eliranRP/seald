import {
  Body,
  Controller,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { bearerToken } from './amr';
import { ApiKeysService } from './api-keys.service';
import { isMcpSurfaceEnabled } from './mcp-enabled';

/**
 * Step-2 credential gate on `POST /mcp`.
 *
 * The JSON-RPC transport (step 4) replaces this controller. Until then
 * the route only checks the key: 404 when the flag is off, 401 for a
 * missing, malformed, unknown, revoked, or expired key, and
 * `insufficient_scope` when `required_scope` is not on the key. It does
 * not run tools and it does not echo the secret.
 */
@Controller('mcp')
export class McpKeyGateController {
  constructor(private readonly keys: ApiKeysService) {}

  @Public()
  @Post()
  @HttpCode(200)
  async post(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Promise<
    | { ok: true; key_id: string; scopes: readonly string[] }
    | { isError: true; slug: 'insufficient_scope' }
  > {
    if (!isMcpSurfaceEnabled()) throw new NotFoundException('not_found');
    const token = bearerToken(authorization);
    if (!token) throw new UnauthorizedException('invalid_key');
    const verified = await this.keys.authenticate(token);
    const required = readRequiredScope(body);
    if (required && !verified.scopes.some((scope) => scope === required)) {
      return { isError: true, slug: 'insufficient_scope' };
    }
    return { ok: true, key_id: verified.keyId, scopes: verified.scopes };
  }
}

function readRequiredScope(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const value = (body as { required_scope?: unknown }).required_scope;
  if (typeof value !== 'string' || value.length === 0) return null;
  return value;
}
