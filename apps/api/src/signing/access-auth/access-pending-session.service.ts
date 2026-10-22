import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import type { SignerSessionClaims } from '../signer-session.service';

/** Cookie that carries the pending (pre-code) session. */
export const ACCESS_PENDING_COOKIE = 'seald_sign_access';
/** Only the access-code routes ever receive it. */
export const ACCESS_PENDING_COOKIE_PATH = '/sign/access-code';
const TTL_SECONDS = 15 * 60;
const ISSUER = 'seald.nromomentum.com/sign/access';

/**
 * Pending signer session (WP-10).
 *
 * When a signer must enter an emailed code, `POST /sign/start` proves the
 * link token but issues no signer session. It sets this cookie instead,
 * which only lets the signer ask for a code and enter it. Its HS256 key
 * is derived from SIGNER_SESSION_SECRET under a separate label, so a
 * pending token never verifies as a `seald_sign` session and the other
 * way round; the cookie name and path differ too.
 */
@Injectable()
export class AccessPendingSessionService {
  private readonly key: Uint8Array | null;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    this.key = env.SIGNER_SESSION_SECRET
      ? new Uint8Array(
          createHmac('sha256', env.SIGNER_SESSION_SECRET)
            .update('seald/sign/access-pending/v1')
            .digest(),
        )
      : null;
  }

  get cookieMaxAgeSeconds(): number {
    return TTL_SECONDS;
  }

  async mint(claims: SignerSessionClaims): Promise<string> {
    if (!this.key) {
      throw new Error('AccessPendingSessionService: SIGNER_SESSION_SECRET is required.');
    }
    return new SignJWT({ env: claims.envelope_id, sub: claims.signer_id, role: 'signer_pending' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime(`${TTL_SECONDS}s`)
      .sign(this.key);
  }

  /** Claims of a valid pending token, else null. */
  async verify(token: string): Promise<SignerSessionClaims | null> {
    if (!this.key) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        algorithms: ['HS256'],
      });
      const env = typeof payload['env'] === 'string' ? payload['env'] : null;
      const sub = typeof payload.sub === 'string' ? payload.sub : null;
      if (!env || !sub || payload['role'] !== 'signer_pending') return null;
      return { envelope_id: env, signer_id: sub };
    } catch {
      return null;
    }
  }
}
