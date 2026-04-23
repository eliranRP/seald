import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { buildTestJwks } from './test-jwks';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';

const TEST_ENV: AppEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db?sslmode=disable',
};

const PROTECTED_ROUTES = [
  ['GET', '/contacts'],
  ['POST', '/contacts'],
  ['GET', '/contacts/00000000-0000-0000-0000-000000000000'],
  ['PATCH', '/contacts/00000000-0000-0000-0000-000000000000'],
  ['DELETE', '/contacts/00000000-0000-0000-0000-000000000000'],
] as const;

describe('Contacts — auth contract (e2e)', () => {
  let app: INestApplication;
  let repo: InMemoryContactsRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;

  beforeAll(async () => {
    tk = await buildTestJwks();
    repo = new InMemoryContactsRepository();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(ContactsRepository)
      .useValue(repo)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => repo.reset());
  afterAll(async () => {
    await app.close();
  });

  it.each(PROTECTED_ROUTES)(
    '%s %s without Authorization → 401 missing_token',
    async (method, url) => {
      const res = await request(app.getHttpServer())[method.toLowerCase() as 'get'](url);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'missing_token' });
    },
  );

  it('GET /contacts with expired token → 401 token_expired', async () => {
    const token = await tk.sign(
      { sub: 'user-1' },
      {
        issuer: `${TEST_ENV.SUPABASE_URL}/auth/v1`,
        audience: TEST_ENV.SUPABASE_JWT_AUDIENCE,
        expiresIn: '-1s',
      },
    );
    const res = await request(app.getHttpServer())
      .get('/contacts')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'token_expired' });
  });
});
