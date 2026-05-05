import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';

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
  SIGNER_SESSION_SECRET: 'x'.repeat(64),
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
  GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
  GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
};

/**
 * E2E coverage of the public `GET /verify/:short_code` endpoint. We mount
 * the full AppModule with in-memory repository implementations so the HTTP
 * pipeline (filters, validation, no-auth path) exercises the same code as
 * production.
 *
 * Goals:
 *  1. The route is reachable WITHOUT an Authorization header (proving the
 *     public contract is wired through Nest's guard chain).
 *  2. 200 returns the expected DTO shape.
 *  3. 404 is returned for unknown short_codes.
 *  4. 401 / 403 are NEVER returned regardless of bearer payload — verify
 *     does not consult the auth guard.
 */
describe('Verify endpoint (e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let contactsRepo: InMemoryContactsRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  const USER_A = '00000000-0000-0000-0000-00000000000a';

  beforeAll(async () => {
    tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();
    contactsRepo = new InMemoryContactsRepository();
    storage = new InMemoryStorageService();
    outbound = new InMemoryOutboundEmailsRepository();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(EnvelopesRepository)
      .useValue(envelopesRepo)
      .overrideProvider(ContactsRepository)
      .useValue(contactsRepo)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outbound)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  let seedCounter = 0;
  async function seedEnvelope(): Promise<{ readonly id: string; readonly short_code: string }> {
    // Each test gets a unique short_code so multiple it() blocks don't
    // collide in the in-memory repo. Format keeps the 13-char width
    // (`vrfy_e2e_NN` -> 13 chars when zero-padded to 4 digits + 'v').
    seedCounter += 1;
    // Base-58 safe: use alphabet chars for the counter suffix (no 0, 1, I, O, l)
    const SAFE = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    const c = SAFE[seedCounter % SAFE.length]!;
    const short_code = `vrfye2eT2222${c}`; // 13 chars, all base-58 safe
    const draft = await envelopesRepo.createDraft({
      owner_id: USER_A,
      title: 'Verify e2e test envelope',
      short_code,
      tc_version: TEST_ENV.TC_VERSION,
      privacy_version: TEST_ENV.PRIVACY_VERSION,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    return { id: draft.id, short_code: draft.short_code };
  }

  it('returns 200 + DTO without an Authorization header', async () => {
    const env = await seedEnvelope();
    const res = await request(app.getHttpServer()).get(`/verify/${env.short_code}`).expect(200);
    expect(res.body.envelope.id).toBe(env.id);
    expect(res.body.envelope.short_code).toBe(env.short_code);
    expect(res.body.envelope.title).toBe('Verify e2e test envelope');
    expect(Array.isArray(res.body.signers)).toBe(true);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.sealed_url).toBeNull(); // draft envelope, not sealed
    // Owner / sender PII must not leak into the public response.
    expect(res.body.envelope.owner_id).toBeUndefined();
    expect(res.body.envelope.sender_email).toBeUndefined();
  });

  it('returns 404 for an unknown short_code', async () => {
    await request(app.getHttpServer()).get('/verify/not_a_real_xx').expect(404);
  });

  it('does not invoke the auth guard — bogus bearer is ignored, no 401', async () => {
    const env = await seedEnvelope();
    const res = await request(app.getHttpServer())
      .get(`/verify/${env.short_code}`)
      .set('Authorization', 'Bearer this.is.not.a.real.jwt')
      .expect(200);
    expect(res.body.envelope.short_code).toBe(env.short_code);
  });

  it('redacts ip / user_agent / metadata from the events list', async () => {
    const env = await seedEnvelope();
    // Append an event with PII fields populated.
    await envelopesRepo.appendEvent({
      envelope_id: env.id,
      signer_id: null,
      actor_kind: 'sender',
      event_type: 'created',
      ip: '203.0.113.7',
      user_agent: 'Mozilla/5.0 (secret)',
      metadata: { secret: 'do_not_leak' },
    });
    const res = await request(app.getHttpServer()).get(`/verify/${env.short_code}`).expect(200);
    const events = res.body.events as ReadonlyArray<Record<string, unknown>>;
    expect(events.length).toBeGreaterThan(0);
    for (const ev of events) {
      expect(ev.ip).toBeUndefined();
      expect(ev.user_agent).toBeUndefined();
      expect(ev.metadata).toBeUndefined();
      expect(ev.envelope_id).toBeUndefined();
    }
  });
});
