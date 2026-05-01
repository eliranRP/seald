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
  APP_PUBLIC_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db?sslmode=disable',
  STORAGE_BUCKET: 'envelopes',
  TC_VERSION: '2026-04-24',
  PRIVACY_VERSION: '2026-04-24',
  EMAIL_PROVIDER: 'logging',
  EMAIL_FROM_ADDRESS: 'onboarding@resend.dev',
  EMAIL_FROM_NAME: 'Seald',
  EMAIL_LEGAL_ENTITY: 'Seald, Inc.',
  EMAIL_LEGAL_POSTAL: 'Postal address available on request — write to legal@seald.test.',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com?subject=Email%20preferences',
  PDF_SIGNING_PROVIDER: 'local',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  ENVELOPE_RETENTION_YEARS: 7,
  WORKER_ENABLED: false,
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
      { sub: '00000000-0000-4000-8000-000000000001' },
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

describe('Contacts — CRUD (e2e)', () => {
  let app: INestApplication;
  let repo: InMemoryContactsRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;

  const USER_A = '00000000-0000-0000-0000-00000000000a';
  const USER_B = '00000000-0000-0000-0000-00000000000b';
  let tokenA: string;
  let tokenB: string;

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

    const signOpts = {
      issuer: `${TEST_ENV.SUPABASE_URL}/auth/v1`,
      audience: TEST_ENV.SUPABASE_JWT_AUDIENCE,
    };
    tokenA = await tk.sign({ sub: USER_A }, signOpts);
    tokenB = await tk.sign({ sub: USER_B }, signOpts);
  });
  beforeEach(() => repo.reset());
  afterAll(async () => {
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('POST /contacts creates and GET /contacts lists only the caller rows', async () => {
    const res = await request(app.getHttpServer())
      .post('/contacts')
      .set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      owner_id: USER_A,
      name: 'Ada',
      email: 'ada@example.com',
      color: '#112233',
    });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/i);

    const list = await request(app.getHttpServer()).get('/contacts').set(auth(tokenA));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const listB = await request(app.getHttpServer()).get('/contacts').set(auth(tokenB));
    expect(listB.body).toHaveLength(0);
  });

  it('POST /contacts normalises email via Transform', async () => {
    const res = await request(app.getHttpServer())
      .post('/contacts')
      .set(auth(tokenA))
      .send({ name: 'Ada', email: '  ADA@Example.COM ', color: '#ABCDEF' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('ada@example.com');
  });

  it('POST /contacts rejects unknown field (owner_id) with 400', async () => {
    const res = await request(app.getHttpServer()).post('/contacts').set(auth(tokenA)).send({
      name: 'Ada',
      email: 'ada@example.com',
      color: '#112233',
      owner_id: USER_B,
    });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('POST /contacts duplicate email for same owner → 409 email_taken', async () => {
    await request(app.getHttpServer())
      .post('/contacts')
      .set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const res = await request(app.getHttpServer())
      .post('/contacts')
      .set(auth(tokenA))
      .send({ name: 'Ada2', email: 'ada@example.com', color: '#445566' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'email_taken' });
  });

  it('GET /contacts/:id owned by another user → 404 (no existence leak)', async () => {
    const created = await request(app.getHttpServer())
      .post('/contacts')
      .set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const res = await request(app.getHttpServer())
      .get(`/contacts/${created.body.id}`)
      .set(auth(tokenB));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'contact_not_found' });
  });

  it('GET /contacts/:id with non-UUID → 400', async () => {
    const res = await request(app.getHttpServer()).get('/contacts/not-a-uuid').set(auth(tokenA));
    expect(res.status).toBe(400);
  });

  it('PATCH /contacts/:id with empty body → 200 echoes current', async () => {
    const created = await request(app.getHttpServer())
      .post('/contacts')
      .set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const res = await request(app.getHttpServer())
      .patch(`/contacts/${created.body.id}`)
      .set(auth(tokenA))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it('PATCH /contacts/:id updates only provided fields', async () => {
    const created = await request(app.getHttpServer())
      .post('/contacts')
      .set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const res = await request(app.getHttpServer())
      .patch(`/contacts/${created.body.id}`)
      .set(auth(tokenA))
      .send({ name: 'Ada L.' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ada L.');
    expect(res.body.email).toBe('ada@example.com');
  });

  it('DELETE /contacts/:id → 204, then GET → 404', async () => {
    const created = await request(app.getHttpServer())
      .post('/contacts')
      .set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const del = await request(app.getHttpServer())
      .delete(`/contacts/${created.body.id}`)
      .set(auth(tokenA));
    expect(del.status).toBe(204);
    const get = await request(app.getHttpServer())
      .get(`/contacts/${created.body.id}`)
      .set(auth(tokenA));
    expect(get.status).toBe(404);
  });

  it('DELETE /contacts/:id owned by another user → 404, row still exists for A', async () => {
    const created = await request(app.getHttpServer())
      .post('/contacts')
      .set(auth(tokenA))
      .send({ name: 'Ada', email: 'ada@example.com', color: '#112233' });
    const del = await request(app.getHttpServer())
      .delete(`/contacts/${created.body.id}`)
      .set(auth(tokenB));
    expect(del.status).toBe(404);
    const get = await request(app.getHttpServer())
      .get(`/contacts/${created.body.id}`)
      .set(auth(tokenA));
    expect(get.status).toBe(200);
  });
});
