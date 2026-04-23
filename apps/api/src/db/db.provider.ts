import { Pool } from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import type { FactoryProvider } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import type { Database } from '../../db/schema';

export const DB_TOKEN = Symbol('DB');

export function createDbProvider(): FactoryProvider<Kysely<Database>> {
  return {
    provide: DB_TOKEN,
    inject: [APP_ENV],
    useFactory: (env: AppEnv) => {
      const pool = new Pool({
        connectionString: env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30_000,
        // Supabase uses a managed CA; do not require CA verification locally.
        // In production the host may inject NODE_EXTRA_CA_CERTS to tighten this.
        ssl: env.DATABASE_URL.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
      });
      return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    },
  };
}
