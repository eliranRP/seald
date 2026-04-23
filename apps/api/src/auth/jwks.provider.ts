import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';

export const JWKS_RESOLVER = Symbol('JWKS_RESOLVER');

export function createJwksProvider() {
  return {
    provide: JWKS_RESOLVER,
    inject: [APP_ENV],
    useFactory: (env: AppEnv): JWTVerifyGetKey => {
      const url = new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
      return createRemoteJWKSet(url);
    },
  };
}
