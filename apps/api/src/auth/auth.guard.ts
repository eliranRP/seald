import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';
import type { AuthUser } from './auth-user';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly strategy: SupabaseJwtStrategy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
