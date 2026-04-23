import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { FactoryProvider } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import type { Database } from '../../db/schema';

export const DB_TOKEN = Symbol('DB');

/**
 * Strip any `sslmode=...` query param from the URL. As of
 * `pg-connection-string` v2.7+, the library treats `sslmode=require` (the
 * value Supabase ships in its connection string) as an alias for
 * `verify-full`, which forces CA chain verification and silently overrides
 * any `ssl: { rejectUnauthorized: false }` passed to the Pool constructor.
 * Result: connections fail with `SELF_SIGNED_CERT_IN_CHAIN` even though the
 * explicit option says not to verify. Stripping the param makes our `ssl`
 * option authoritative.
 */
function stripSslMode(url: string): string {
  return url.replace(/([?&])sslmode=[^&]*(&|$)/, (_m, lead: string, trail: string) =>
    trail === '&' ? lead : lead === '?' ? '' : '',
  );
}

export function createDbProvider(): FactoryProvider<Kysely<Database>> {
  return {
    provide: DB_TOKEN,
    inject: [APP_ENV],
    useFactory: (env: AppEnv) => {
      const sslDisabled = /[?&]sslmode=disable(&|$)/.test(env.DATABASE_URL);
      const pool = new Pool({
        connectionString: stripSslMode(env.DATABASE_URL),
        max: 10,
        idleTimeoutMillis: 30_000,
        // Supabase uses a managed CA; do not require CA verification locally.
        // In production the host may inject NODE_EXTRA_CA_CERTS to tighten this.
        ssl: sslDisabled ? false : { rejectUnauthorized: false },
      });
      return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    },
  };
}
