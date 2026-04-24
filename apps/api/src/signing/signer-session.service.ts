import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';

/**
 * Per-signer session JWT.
 *
 * Issued by `POST /sign/start` once the opaque token hash has been verified.
 * Carried as an HttpOnly, SameSite=Lax cookie `seald_sign` on every subsequent
 * `/sign/*` request.
 *
 * Scope is deliberately narrow — one envelope, one signer — and the lifetime
 * is short (30 minutes by default) so a leaked session is useless very
 * quickly. Renewed on every successful authenticated `/sign/*` call.
 *
 * Symmetric HS256 because the issuer and verifier are both this service; no
 * third-party consumes this token. Secret read from `SIGNER_SESSION_SECRET`.
 * The secret is optional in `NODE_ENV=test` (test code injects the service
 * directly with a test secret) and required in prod (zod enforces at boot).
 */
export interface SignerSessionClaims {
  readonly envelope_id: string;
  readonly signer_id: string;
}

export const SIGNER_SESSION_COOKIE = 'seald_sign';
const DEFAULT_TTL_SECONDS = 30 * 60; // 30 minutes
const JWT_ISSUER = 'seald.app/sign';

export class SignerSessionVerifyError extends Error {
  constructor(public readonly reason: 'missing' | 'expired' | 'invalid') {
    super(`signer_session_${reason}`);
    this.name = 'SignerSessionVerifyError';
  }
}

@Injectable()
export class SignerSessionService {
  private readonly secret: Uint8Array | null;
  private readonly ttlSeconds: number;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    // The secret is declared optional in env.schema so non-test modules can
    // bootstrap without it. At mint/verify time we fail fast with a clear
    // error if it's missing.
    this.secret = env.SIGNER_SESSION_SECRET
      ? new TextEncoder().encode(env.SIGNER_SESSION_SECRET)
      : null;
    this.ttlSeconds = DEFAULT_TTL_SECONDS;
  }

  /** Mint a fresh signer session JWT with the given claims. */
  async mint(claims: SignerSessionClaims): Promise<string> {
    if (!this.secret) {
      throw new Error('SignerSessionService: SIGNER_SESSION_SECRET is required at mint time.');
    }
    return new SignJWT({
      env: claims.envelope_id,
      sub: claims.signer_id,
      role: 'signer',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(JWT_ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.secret);
  }

  /**
   * Verify a session JWT. Throws SignerSessionVerifyError with a reason when
   * invalid so the guard can surface a precise 401.
   */
  async verify(token: string): Promise<SignerSessionClaims> {
    if (!this.secret) {
      throw new Error('SignerSessionService: SIGNER_SESSION_SECRET is required at verify time.');
    }
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: JWT_ISSUER,
        algorithms: ['HS256'],
      });
      const env = typeof payload['env'] === 'string' ? payload['env'] : null;
      const sub = typeof payload.sub === 'string' ? payload.sub : null;
      if (!env || !sub) {
        throw new SignerSessionVerifyError('invalid');
      }
      return { envelope_id: env, signer_id: sub };
    } catch (err) {
      if (err instanceof SignerSessionVerifyError) throw err;
      // jose throws with `code` we can discriminate on.
      const code = (err as { code?: string }).code;
      if (code === 'ERR_JWT_EXPIRED') {
        throw new SignerSessionVerifyError('expired');
      }
      throw new SignerSessionVerifyError('invalid');
    }
  }

  /** Cookie TTL in seconds — exposed so guard + controller can sync Max-Age. */
  get cookieMaxAgeSeconds(): number {
    return this.ttlSeconds;
  }
}
