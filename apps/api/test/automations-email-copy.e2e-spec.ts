import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AUTOMATION_MAX_ATTEMPTS, type FeatureFlag } from 'shared';
import { AppModule } from '../src/app.module';
import { EmailCopyActionExecutor } from '../src/automations/actions/email/email-copy.executor';
import { EmailCopyRepository } from '../src/automations/actions/email/email-copy.repository';
import { FakeEmailCopyRepo } from '../src/automations/actions/email/__tests__/fake-email-copy-repo';
import type { ClaimedAutomationJob } from '../src/automations/automations.repository.pg';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { EmailDispatcherService } from '../src/email/email-dispatcher.service';
import { EmailSender, type EmailMessage } from '../src/email/email-sender';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { buildTestJwks } from './test-jwks';

/**
 * WP-33 (automations A7) over HTTP with in-memory repositories: the
 * `email_copy` executor queues the notice, the dispatcher mints and mails
 * the stop link, the public stop route confirms on GET (no state change)
 * and acts on POST, a spent or garbage link is a 404, and nothing else is
 * queued for that address afterwards. The route is a 404 while
 * `workflowAutomations` is off.
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
  TC_VERSION: 'tc',
  PRIVACY_VERSION: 'pp',
  SIGNER_SESSION_SECRET: 'x'.repeat(64),
  CRON_SECRET: 's'.repeat(48),
  EMAIL_PROVIDER: 'logging',
  EMAIL_FROM_ADDRESS: 'onboarding@resend.dev',
  EMAIL_FROM_NAME: 'Seald',
  EMAIL_LEGAL_ENTITY: 'Seald',
  EMAIL_LEGAL_POSTAL: 'Postal address available on request.',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com',
  PDF_SIGNING_PROVIDER: 'local',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  WORKER_ENABLED: false,
  AUTOMATIONS_DISABLED: false,
  AUTOMATION_SECRETS_KEY: '1e'.repeat(32),
  GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
  GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
};

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
const OWNER = '00000000-0000-4000-8000-0000000000a1';

function job(runId: string, to: string[]): ClaimedAutomationJob {
  return {
    job_id: `job-${runId}`,
    run_id: runId,
    automation_id: '33333333-3333-4333-8333-333333333333',
    attempts: 1,
    max_attempts: AUTOMATION_MAX_ATTEMPTS,
    owner_id: OWNER,
    envelope_id: 'env-1',
    event_id: `evt-${runId}`,
    signer_id: null,
    trigger: 'envelope_sealed',
    action: 'email_copy',
    config: { to },
  };
}

describe('Automations email copy and stop link (e2e)', () => {
  let app: INestApplication;
  let copyRepo: FakeEmailCopyRepo;
  let outbound: InMemoryOutboundEmailsRepository;
  let executor: EmailCopyActionExecutor;
  let dispatcher: EmailDispatcherService;
  const sent: EmailMessage[] = [];

  beforeAll(async () => {
    const tk = await buildTestJwks();
    copyRepo = new FakeEmailCopyRepo();
    outbound = new InMemoryOutboundEmailsRepository();
    const envelopesRepo = new InMemoryEnvelopesRepository();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(EnvelopesRepository)
      .useValue(envelopesRepo)
      .overrideProvider(EnvelopeDocumentsRepository)
      .useValue(new InMemoryEnvelopeDocumentsRepository(envelopesRepo))
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outbound)
      .overrideProvider(EmailCopyRepository)
      .useValue(copyRepo)
      .overrideProvider(EmailSender)
      .useValue({
        send: async (m: EmailMessage) => {
          sent.push(m);
          return { providerId: 'prv' };
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    executor = moduleRef.get(EmailCopyActionExecutor);
    dispatcher = moduleRef.get(EmailDispatcherService);
  });

  beforeEach(() => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    sent.length = 0;
    outbound.reset();
    copyRepo.suppressions.clear();
    copyRepo.sends.length = 0;
    copyRepo.tokens.clear();
    copyRepo.recipes.clear();
  });

  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  afterAll(async () => {
    await app.close();
  });

  function stopPath(msg: EmailMessage): string {
    const m = /automations\/stop\?t=([A-Za-z0-9_-]{43})/.exec(msg.text);
    if (!m) throw new Error('no stop link in the mail');
    return `/automations/stop?t=${m[1]}`;
  }

  it('mails the notice, then the stop link removes only that address', async () => {
    copyRepo.recipes.set('r1', {
      ownerId: OWNER,
      to: ['ada@example.com', 'bob@example.com'],
      enabled: true,
    });
    expect(await executor.execute(job('run-1', ['ada@example.com', 'bob@example.com']))).toEqual({
      kind: 'done',
    });
    await dispatcher.flushOnce();
    expect(sent.map((m) => m.to.email).sort()).toEqual(['ada@example.com', 'bob@example.com']);
    const ada = sent.find((m) => m.to.email === 'ada@example.com')!;
    const path = stopPath(ada);

    // GET is a confirmation page and changes nothing (mail scanners prefetch it).
    const page = await request(app.getHttpServer()).get(path).expect(200);
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.text).toContain('ada@example.com');
    expect(copyRepo.suppressions.size).toBe(0);

    const token = path.split('t=')[1]!;
    const done = await request(app.getHttpServer())
      .post('/automations/stop')
      .type('form')
      .send({ t: token })
      .expect(200);
    expect(done.text).toContain('ada@example.com');
    expect(copyRepo.suppressions).toEqual(new Set([`${OWNER}|ada@example.com`]));
    expect(copyRepo.recipes.get('r1')).toMatchObject({ to: ['bob@example.com'], enabled: true });

    // Single use: the same link now is a 404, and so is a JSON replay.
    await request(app.getHttpServer()).get(path).expect(404);
    await request(app.getHttpServer()).post('/automations/stop').send({ t: token }).expect(404);

    // A later run queues mail for bob only.
    outbound.reset();
    await executor.execute(job('run-2', ['ada@example.com', 'bob@example.com']));
    expect(outbound.rows.map((r) => r.to_email)).toEqual(['bob@example.com']);
  });

  it('answers a malformed or unknown token with 404 and changes nothing', async () => {
    await request(app.getHttpServer()).get('/automations/stop').expect(404);
    await request(app.getHttpServer()).get('/automations/stop?t=short').expect(404);
    await request(app.getHttpServer())
      .post('/automations/stop')
      .send({ t: 'A'.repeat(43) })
      .expect(404);
    await request(app.getHttpServer()).post('/automations/stop').send({}).expect(404);
    expect(copyRepo.suppressions.size).toBe(0);
  });

  it('does not exist while workflowAutomations is off', async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: false };
    await request(app.getHttpServer())
      .get(`/automations/stop?t=${'A'.repeat(43)}`)
      .expect(404);
    await request(app.getHttpServer())
      .post('/automations/stop')
      .send({ t: 'A'.repeat(43) })
      .expect(404);
  });
});
