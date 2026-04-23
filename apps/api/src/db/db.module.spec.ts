import { Test } from '@nestjs/testing';
import { Kysely } from 'kysely';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { DbModule } from './db.module';
import { DB_TOKEN } from './db.provider';

const TEST_ENV: AppEnv = {
  NODE_ENV: 'test',
  PORT: 3000,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db?sslmode=disable',
};

describe('DbModule', () => {
  it('provides a Kysely instance via DB_TOKEN', async () => {
    const mod = await Test.createTestingModule({ imports: [DbModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .compile();

    const db = mod.get(DB_TOKEN);
    expect(db).toBeInstanceOf(Kysely);

    // Close without executing queries — pool is lazy, destroy is safe pre-query.
    await mod.close();
  });

  it('closes the pool on shutdown', async () => {
    const mod = await Test.createTestingModule({ imports: [DbModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .compile();

    const db = mod.get(DB_TOKEN) as Kysely<unknown>;
    const destroy = jest.spyOn(db, 'destroy');

    await mod.close();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
