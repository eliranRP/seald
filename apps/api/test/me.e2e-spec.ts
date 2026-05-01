import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { TemplatesRepository } from '../src/templates/templates.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { IdempotencyRepository } from '../src/me/idempotency.repository';
import { SupabaseAdminClient } from '../src/me/supabase-admin.client';
import { buildTestJwks } from './test-jwks';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryTemplatesRepository } from './in-memory-templates-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryIdempotencyRepository } from './in-memory-idempotency-repository';
import { StubSupabaseAdminClient } from './stub-supabase-admin';

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

const USER_A = '00000000-0000-0000-0000-00000000000a';
const USER_B = '00000000-0000-0000-0000-00000000000b';
const USER_A_EMAIL = 'maya@example.com';

describe('/me (DSAR + account deletion) — e2e', () => {
  let app: INestApplication;
  let contactsRepo: InMemoryContactsRepository;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let templatesRepo: InMemoryTemplatesRepository;
  let outboundEmailsRepo: InMemoryOutboundEmailsRepository;
  let idempotencyRepo: InMemoryIdempotencyRepository;
  let supabaseAdmin: StubSupabaseAdminClient;
  let callLog: string[];
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    tk = await buildTestJwks();
    contactsRepo = new InMemoryContactsRepository();
    envelopesRepo = new InMemoryEnvelopesRepository();
    templatesRepo = new InMemoryTemplatesRepository();
    outboundEmailsRepo = new InMemoryOutboundEmailsRepository();
    idempotencyRepo = new InMemoryIdempotencyRepository();
    supabaseAdmin = new StubSupabaseAdminClient();

    callLog = [];
    // Wire ordering tracking for both repos so we can assert
    // idempotency-wipe-precedes-admin-call invariant.
    const origDelete = idempotencyRepo.deleteByUser.bind(idempotencyRepo);
    idempotencyRepo.deleteByUser = async (id: string): Promise<number> => {
      callLog.push('idempotency.deleteByUser');
      return origDelete(id);
    };
    supabaseAdmin.callLog = callLog;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(ContactsRepository)
      .useValue(contactsRepo)
      .overrideProvider(EnvelopesRepository)
      .useValue(envelopesRepo)
      .overrideProvider(TemplatesRepository)
      .useValue(templatesRepo)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outboundEmailsRepo)
      .overrideProvider(IdempotencyRepository)
      .useValue(idempotencyRepo)
      .overrideProvider(SupabaseAdminClient)
      .useValue(supabaseAdmin)
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
    tokenA = await tk.sign({ sub: USER_A, email: USER_A_EMAIL }, signOpts);
    tokenB = await tk.sign({ sub: USER_B, email: 'b@example.com' }, signOpts);
  });

  beforeEach(() => {
    contactsRepo.reset();
    envelopesRepo.reset();
    templatesRepo['rows']?.clear?.();
    outboundEmailsRepo.rows.length = 0;
    idempotencyRepo.reset();
    supabaseAdmin.reset();
    callLog.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  // ---------- GET /me/export ----------------------------------------

  describe('GET /me/export', () => {
    it('without Authorization → 401 missing_token', async () => {
      const res = await request(app.getHttpServer()).get('/me/export');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'missing_token' });
    });

    it('returns a JSON download scoped to the caller with correct headers', async () => {
      // Seed user A with one contact + one template; user B is empty.
      // We can't easily seed envelopes for owner A here without the full
      // draft/send flow, so the exported envelopes array stays empty —
      // that's still a valid AccountExport per the contract.
      await contactsRepo.create({
        owner_id: USER_A,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      });

      const res = await request(app.getHttpServer())
        .get('/me/export')
        .set(auth(tokenA))
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['cache-control']).toBe('no-store');
      const cd = res.headers['content-disposition'] as string;
      // RFC 6266 (issue #44): both an ASCII `filename=` fallback AND a
      // `filename*=UTF-8''<encoded>` extension. The browser prefers the
      // latter; we assert both pieces are present.
      expect(cd).toMatch(/^attachment; filename="seald-export-/);
      expect(cd).toContain(USER_A);
      expect(cd).toMatch(/\.json"; filename\*=UTF-8''seald-export-/);
      expect(cd).toMatch(/\.json$/);

      const payload = JSON.parse((res.body as Buffer).toString('utf8'));
      expect(payload.meta.format_version).toBe('1.0');
      expect(payload.meta.user).toEqual({ id: USER_A, email: USER_A_EMAIL });
      expect(payload.meta.includes_files).toBe(false);
      expect(payload.meta.counts).toEqual({
        contacts: 1,
        envelopes: 0,
        templates: 0,
        outbound_emails: 0,
      });
      expect(typeof payload.meta.generated_at).toBe('string');
      expect(payload.contacts).toHaveLength(1);
      expect(payload.contacts[0].owner_id).toBe(USER_A);
      expect(payload.envelopes).toEqual([]);
      expect(payload.templates).toEqual([]);
    });

    it("returns only the caller's data, not other users' rows", async () => {
      await contactsRepo.create({
        owner_id: USER_A,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      });
      await contactsRepo.create({
        owner_id: USER_B,
        name: 'Bea',
        email: 'bea@example.com',
        color: '#aabbcc',
      });

      const res = await request(app.getHttpServer())
        .get('/me/export')
        .set(auth(tokenB))
        .buffer(true)
        .parse((response, callback) => {
          const chunks: Buffer[] = [];
          response.on('data', (c: Buffer) => chunks.push(c));
          response.on('end', () => callback(null, Buffer.concat(chunks)));
        });

      expect(res.status).toBe(200);
      const payload = JSON.parse((res.body as Buffer).toString('utf8'));
      expect(payload.meta.user.id).toBe(USER_B);
      expect(payload.meta.counts.contacts).toBe(1);
      expect(payload.contacts).toHaveLength(1);
      expect(payload.contacts[0].owner_id).toBe(USER_B);
    });
  });

  // ---------- DELETE /me --------------------------------------------

  describe('DELETE /me', () => {
    it('without Authorization → 401 missing_token', async () => {
      const res = await request(app.getHttpServer())
        .delete('/me')
        .send({ confirm: 'DELETE_MY_ACCOUNT' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'missing_token' });
    });

    it('with wrong confirm phrase → 400 (validation)', async () => {
      const res = await request(app.getHttpServer())
        .delete('/me')
        .set(auth(tokenA))
        .send({ confirm: 'delete me' });
      expect(res.status).toBe(400);
      expect(supabaseAdmin.deletedUserIds).toEqual([]);
      expect(callLog).toEqual([]);
    });

    it('with missing confirm → 400 (validation)', async () => {
      const res = await request(app.getHttpServer()).delete('/me').set(auth(tokenA)).send({});
      expect(res.status).toBe(400);
      expect(supabaseAdmin.deletedUserIds).toEqual([]);
    });

    it('happy path → 204 + idempotency wipe runs BEFORE admin call', async () => {
      idempotencyRepo.seed(USER_A, 4);

      const res = await request(app.getHttpServer())
        .delete('/me')
        .set(auth(tokenA))
        .send({ confirm: 'DELETE_MY_ACCOUNT' });

      expect(res.status).toBe(204);
      expect(idempotencyRepo.countFor(USER_A)).toBe(0);
      expect(supabaseAdmin.deletedUserIds).toEqual([USER_A]);
      // Order matters — see MeService comment. Idempotency wipe first
      // because admin failure is retryable; idempotency wipe is
      // idempotent.
      expect(callLog).toEqual(['idempotency.deleteByUser', 'supabaseAdmin.deleteUser']);
    });

    it('admin failure → 503 admin_api_unavailable, but idempotency wipe still ran', async () => {
      idempotencyRepo.seed(USER_A, 2);
      supabaseAdmin.failNextWithAdminError('SUPABASE_SERVICE_ROLE_KEY missing');

      const res = await request(app.getHttpServer())
        .delete('/me')
        .set(auth(tokenA))
        .send({ confirm: 'DELETE_MY_ACCOUNT' });

      expect(res.status).toBe(503);
      // Idempotency rows were still cleared (the wipe ran first, then
      // the admin call threw).
      expect(idempotencyRepo.countFor(USER_A)).toBe(0);
      expect(supabaseAdmin.deletedUserIds).toEqual([]);
    });

    it('non-admin error from the admin client surfaces as a 500', async () => {
      // Random Error (not a SupabaseAdminError) should NOT be swallowed
      // by the 503 mapping — it bubbles, Nest's default exception
      // handler turns it into 500.
      supabaseAdmin.failNextWithUnknownError('boom');

      const res = await request(app.getHttpServer())
        .delete('/me')
        .set(auth(tokenA))
        .send({ confirm: 'DELETE_MY_ACCOUNT' });

      expect(res.status).toBe(500);
    });
  });
});
