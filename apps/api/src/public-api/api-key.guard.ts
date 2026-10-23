import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyAuthService, type ApiKeyPrincipal } from '../api-keys/api-key-auth.service';

/** Where the guard leaves the verified credential for the controller. */
export const PUBLIC_API_PRINCIPAL = Symbol('publicApiPrincipal');

export type PublicApiRequest = Request & { [PUBLIC_API_PRINCIPAL]?: ApiKeyPrincipal };

/**
 * The only credential check on `/api/v1` (parity plan D1; the
 * counterpart of `McpAuthGuard`). The controllers are `@Public()` because
 * the global AuthGuard accepts a Supabase JWT only; this guard accepts an
 * API key, through the one verifier `ApiKeyAuthService.verify()` (WP-14).
 * A Supabase JWT is not a key, so it fails here with 401 too.
 *
 * 401 is only for a missing, malformed, unknown, revoked or expired
 * credential. Missing scopes are decided by the tool layer, which answers
 * 403 `insufficient_scope`.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeyAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<PublicApiRequest>();
    const header = req.headers.authorization;
    const token = ApiKeyAuthService.bearer(header);
    if (header !== undefined && token === null) throw new UnauthorizedException('invalid_token');
    const result = await this.keys.verify(token);
    if (!result.ok) throw new UnauthorizedException(result.error);
    req[PUBLIC_API_PRINCIPAL] = result;
    return true;
  }
}
