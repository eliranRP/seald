import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { JWKS_RESOLVER } from './jwks.provider';
import type { AuthUser } from './auth-user';

@Injectable()
export class SupabaseJwtStrategy {
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    @Inject(APP_ENV) env: AppEnv,
    @Inject(JWKS_RESOLVER) private readonly jwks: JWTVerifyGetKey,
  ) {
    this.issuer = new URL('/auth/v1', env.SUPABASE_URL).toString().replace(/\/$/, '');
    this.audience = env.SUPABASE_JWT_AUDIENCE;
  }

  async validate(token: string): Promise<AuthUser> {
    let payload: Record<string, unknown>;
    try {
      const { payload: verified } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      payload = verified as Record<string, unknown>;
    } catch (err) {
      if (err instanceof errors.JWTExpired) {
        throw new UnauthorizedException('token_expired');
      }
      throw new UnauthorizedException('invalid_token');
    }

    const sub = payload.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      throw new UnauthorizedException('invalid_token');
    }

    const email =
      typeof payload.email === 'string' && payload.email.length > 0 ? payload.email : null;

    const appMetadata = (payload.app_metadata ?? {}) as Record<string, unknown>;
    const provider =
      typeof appMetadata.provider === 'string' && appMetadata.provider.length > 0
        ? appMetadata.provider
        : null;

    return { id: sub, email, provider };
  }
}
