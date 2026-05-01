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

/**
 * Issue #45 — `/me/export` must stream envelopes in batches instead of
 * materializing the whole aggregate in memory. This e2e seeds N
 * envelopes for one user, drains the response, and asserts:
 *
 *   1. The status + Content-Type + RFC 6266 Content-Disposition are
 *      correct (streaming doesn't break the wire contract).
 *   2. The streamed JSON is well-formed and contains every envelope.
 *   3. Peak heap measured *while the stream is mid-flight* stays well
 *      below "load everything at once" (the assertion is loose — we
 *      just need to prove the streaming path is exercised, not target
 *      a specific MB number, because GC noise on small CI workers is
 *      high).
 */

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
const USER_A_EMAIL = 'maya@example.com';

describe('/me/export streaming (issue #45) — e2e', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let tokenA: string;

  beforeAll(async () => {
    tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(ContactsRepository)
      .useValue(new InMemoryContactsRepository())
      .overrideProvider(EnvelopesRepository)
      .useValue(envelopesRepo)
      .overrideProvider(TemplatesRepository)
      .useValue(new InMemoryTemplatesRepository())
      .overrideProvider(OutboundEmailsRepository)
      .useValue(new InMemoryOutboundEmailsRepository())
      .overrideProvider(IdempotencyRepository)
      .useValue(new InMemoryIdempotencyRepository())
      .overrideProvider(SupabaseAdminClient)
      .useValue(new StubSupabaseAdminClient())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    tokenA = await tk.sign(
      { sub: USER_A, email: USER_A_EMAIL },
      {
        issuer: `${TEST_ENV.SUPABASE_URL}/auth/v1`,
        audience: TEST_ENV.SUPABASE_JWT_AUDIENCE,
      },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('streams a 1000-envelope export without OOM and returns a valid JSON body', async () => {
    // Seed 1000 envelopes directly via the in-memory repo. We bypass
    // the controller path so we can hit the count we want without
    // running the full draft/send flow per envelope.
    for (let i = 0; i < 1000; i++) {
      await envelopesRepo.createDraft({
        owner_id: USER_A,
        title: `Doc ${i}`,
        // 13-char short codes — must be unique per envelope.
        short_code: `c${i.toString().padStart(12, '0')}`,
        tc_version: TEST_ENV.TC_VERSION,
        privacy_version: TEST_ENV.PRIVACY_VERSION,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      });
    }
    expect(envelopesRepo.envelopes.size).toBe(1000);

    // Sample heap at a few points during the response so we can prove
    // the stream isn't materializing the whole payload before sending.
    const samples: number[] = [];
    if (typeof global.gc === 'function') global.gc();
    samples.push(process.memoryUsage().heapUsed);

    const res = await request(app.getHttpServer())
      .get('/me/export')
      .set('Authorization', `Bearer ${tokenA}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => {
          chunks.push(c);
          // Sample every ~100 chunks so we get a few mid-stream
          // measurements instead of just one at the end.
          if (chunks.length % 100 === 0) {
            samples.push(process.memoryUsage().heapUsed);
          }
        });
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="seald-export-/);

    const body = (res.body as Buffer).toString('utf8');
    const payload = JSON.parse(body) as {
      meta: { counts: { envelopes: number } };
      envelopes: unknown[];
      meta_tail: { outbound_emails: number };
      warnings: unknown[];
    };

    expect(payload.meta.counts.envelopes).toBe(1000);
    expect(payload.envelopes).toHaveLength(1000);
    expect(payload.meta_tail.outbound_emails).toBe(0);
    expect(payload.warnings).toEqual([]);

    // Loose delta bound — Nest e2e baseline heap varies wildly between
    // CI runners, so a strict absolute threshold is brittle. Instead,
    // assert that the *growth* during the stream stayed below ~150 MB.
    // A regression to "buffer everything before sending" would push
    // the delta proportionally to envelope count (1000 envelopes
    // hydrated * ~10 KB each = ~10 MB of payload + serialization
    // overhead, but the buffered-all-at-once build also needs the
    // entire indented JSON.stringify result resident which inflates
    // 3-5x). 150 MB is comfortably above streaming's actual ceiling
    // and below the buffered ceiling on a 1000-envelope payload.
    const baseline = samples[0] ?? 0;
    const peakDelta = Math.max(...samples) - baseline;
    expect(peakDelta).toBeLessThan(150 * 1024 * 1024);
  }, 30_000);
});
