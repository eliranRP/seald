import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';
import type { AuthUser } from './auth-user';

/**
 * Default-deny user-JWT guard. Registered globally as APP_GUARD in
 * AuthModule, so every controller route requires a valid Supabase JWT
 * unless explicitly tagged with `@Public()` (rule 5.1). Unauthenticated
 * surfaces (health, verify, /sign, /internal/cron) opt out via
 * `@Public()`; signer-session and cron-secret surfaces still apply their
 * own guards on top.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly strategy: SupabaseJwtStrategy,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: AuthUser;
    }>();

    const header = req.headers.authorization;
    const token = extractBearer(header);
    if (!token) {
      throw new UnauthorizedException('missing_token');
    }

    req.user = await this.strategy.validate(token);
    return true;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (scheme !== 'Bearer' || !value) return null;
  return value;
}
