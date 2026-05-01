import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { errors, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { JWKS_RESOLVER } from './jwks.provider';
import type { AuthUser } from './auth-user';

/**
 * Hyphenated 8-4-4-4-12 hex token (RFC 4122 UUID shape). We deliberately
 * accept any version + any variant nibble — Supabase issues v4 today,
 * but tightening the regex would (a) lock us out of a future migration
 * to v7 (time-sortable) and (b) reject the synthetic all-zero/all-`a`
 * fixtures used pervasively in our e2e suite. The defense-in-depth goal
 * (issue #44) is to forbid quote / semicolon / CR / LF / `..` bytes
 * before they reach `Content-Disposition` or log lines — the strict hex
 * shape achieves that without policing UUID semantics.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // Defense-in-depth (issue #44): the `sub` claim flows verbatim into
    // log lines, the `Content-Disposition` filename of the DSAR export,
    // and SQL `where owner_id = $1` parameters. Supabase always issues
    // UUIDs here, but a misconfigured / hostile issuer could land a
    // shell- or header-meaningful byte. Reject anything that isn't a
    // canonical RFC 4122 UUID at the boundary so downstream callers can
    // assume the invariant.
    if (!UUID_RE.test(sub)) {
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
