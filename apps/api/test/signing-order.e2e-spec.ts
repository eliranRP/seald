import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { EnvelopeSchema } from 'shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { ReminderSchedulerService } from '../src/reminders/reminder-scheduler.service';
import { SigningOrderService } from '../src/signing/signing-order.service';
import { SigningTokenService } from '../src/signing/signing-token.service';
import { StepSweepRepository } from '../src/signing/step-sweep.service';
import { StorageService } from '../src/storage/storage.service';
import { dispatchSignLinks } from './dispatched-sign-links';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStepSweepRepository } from './in-memory-step-sweep-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { setFlag } from './pades-e2e-harness';
import { stubGdriveForEnvelopeDetail } from './stub-gdrive-for-envelope-detail';
import { buildTestJwks } from './test-jwks';

/**
 * WP-05 signing order, end to end through AppModule with in-memory repos:
 *
 *   - flag on, sequential, 3 signers across 2 steps: send invites step 1
 *     only; step 2 gets no invite (and no turn) until both step-1 signers
 *     have signed; the last step-1 signature appends `step_started` and
 *     queues step 2's invite; the envelope then completes.
 *   - a decline mid-step ends the envelope; the later step is never invited.
 *   - reminders skip a later step even when it somehow holds a link.
 *   - flag off: the route 404s, responses carry no `invited_at` / `step`,
 *     and send stays parallel even for a draft stored as sequential.
 */
const CRON_SECRET = 'c'.repeat(48);
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
  EMAIL_LEGAL_ENTITY: 'Seald',
  EMAIL_LEGAL_POSTAL: 'Postal address available on request — write to legal@seald.test.',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com?subject=Email%20preferences',
  PDF_SIGNING_PROVIDER: 'local',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  WORKER_ENABLED: false,
  GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
  GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
  CRON_SECRET,
};

const USER_A = '00000000-0000-0000-0000-00000000000a';
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

interface Draft {
  readonly envId: string;
  readonly signerIds: Record<string, string>;
}

describe('Signing order (WP-05, e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let outbound: InMemoryOutboundEmailsRepository;
  let storage: InMemoryStorageService;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let auth: { Authorization: string };
  let tinyPdf: Buffer;
  let png: Buffer;

  beforeAll(async () => {
    tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();
    outbound = new InMemoryOutboundEmailsRepository();
    storage = new InMemoryStorageService();

    const moduleRef = await stubGdriveForEnvelopeDetail(
      Test.createTestingModule({ imports: [AppModule] }),
    )
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(EnvelopesRepository)
      .useValue(envelopesRepo)
      .overrideProvider(EnvelopeDocumentsRepository)
      .useValue(new InMemoryEnvelopeDocumentsRepository(envelopesRepo))
      .overrideProvider(ContactsRepository)
      .useValue(new InMemoryContactsRepository())
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outbound)
      .overrideProvider(StepSweepRepository)
      .useValue(new InMemoryStepSweepRepository(envelopesRepo, outbound))
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const token = await tk.sign(
      { sub: USER_A, email: 'sender@example.com' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );
    auth = { Authorization: `Bearer ${token}` };

    const doc = await PDFDocument.create();
    doc.addPage([300, 200]);
    tinyPdf = Buffer.from(await doc.save());
    png = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
  });

  beforeEach(() => {
    envelopesRepo.reset();
    outbound.reset();
    storage.reset();
  });

  afterEach(() => setFlag('signingOrder', undefined));

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** A draft with one required signature field per signer. */
  async function buildDraft(names: readonly string[]): Promise<Draft> {
    const env = await http().post('/envelopes').set(auth).send({ title: 'Ordered' }).expect(201);
    const envId = env.body.id as string;
    await http()
      .post(`/envelopes/${envId}/upload`)
      .set(auth)
      .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' })
      .expect(201);
    const signerIds: Record<string, string> = {};
    for (const name of names) {
      const res = await http()
        .post(`/envelopes/${envId}/signers`)
        .set(auth)
        .send({ email: `${name}@example.com`, name })
        .expect(201);
      signerIds[name] = res.body.id as string;
    }
    await http()
      .put(`/envelopes/${envId}/fields`)
      .set(auth)
      .send({
        fields: names.map((name, i) => ({
          signer_id: signerIds[name],
          kind: 'signature',
          page: 1,
          x: 0.1,
          y: 0.1 + i * 0.2,
          required: true,
        })),
      })
      .expect(200);
    return { envId, signerIds };
  }

  async function startSession(envId: string, token: string): Promise<request.Response> {
    return http().post('/sign/start').send({ envelope_id: envId, token });
  }

  /** Full signer flow from a link token; returns the submit response. */
  async function signWith(envId: string, token: string): Promise<request.Response> {
    const started = await startSession(envId, token);
    expect(started.status).toBe(200);
    const setCookie = started.headers['set-cookie'] as unknown as string[] | string;
    const cookie = (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(';')[0]!;
    await http().post('/sign/accept-terms').set('Cookie', cookie).expect(204);
    await http()
      .post('/sign/signature')
      .set('Cookie', cookie)
      .field('format', 'drawn')
      .attach('image', png, { filename: 's.png', contentType: 'image/png' })
      .expect(200);
    return http().post('/sign/submit').set('Cookie', cookie);
  }

  function invitesTo(envId: string): string[] {
    return outbound.rows
      .filter((r) => r.envelope_id === envId && r.kind === 'invite')
      .map((r) => r.to_email)
      .sort();
  }

  function eventsOf(envId: string, type: string) {
    return envelopesRepo.events.filter((e) => e.envelope_id === envId && e.event_type === type);
  }

  async function sequentialTwoSteps(): Promise<Draft> {
    const draft = await buildDraft(['ada', 'bea', 'cy']);
    const res = await http()
      .put(`/envelopes/${draft.envId}/signing-order`)
      .set(auth)
      .send({
        delivery_mode: 'sequential',
        signers: [
          { signer_id: draft.signerIds['ada'], signing_order: 1 },
          { signer_id: draft.signerIds['bea'], signing_order: 1 },
          { signer_id: draft.signerIds['cy'], signing_order: 2 },
        ],
      });
    expect(res.status).toBe(200);
    return draft;
  }

  describe('flag on', () => {
    beforeEach(() => setFlag('signingOrder', true));

    it('invites step 2 only after every step-1 signer has signed', async () => {
      const { envId, signerIds } = await sequentialTwoSteps();

      const detail = await http().get(`/envelopes/${envId}`).set(auth).expect(200);
      expect(EnvelopeSchema.safeParse(detail.body).success).toBe(true);
      expect(detail.body.delivery_mode).toBe('sequential');
      const steps = Object.fromEntries(
        (detail.body.signers as Array<{ name: string; step: number; invited_at: unknown }>).map(
          (s) => [s.name, [s.step, s.invited_at]],
        ),
      );
      expect(steps).toEqual({ ada: [1, null], bea: [1, null], cy: [2, null] });

      const sent = await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      expect(EnvelopeSchema.safeParse(sent.body).success).toBe(true);
      const byName = new Map(
        (sent.body.signers as Array<{ name: string; invited_at: string | null }>).map((s) => [
          s.name,
          s.invited_at,
        ]),
      );
      expect(byName.get('ada')).toEqual(expect.any(String));
      expect(byName.get('bea')).toEqual(expect.any(String));
      expect(byName.get('cy')).toBeNull();
      expect(invitesTo(envId)).toEqual(['ada@example.com', 'bea@example.com']);
      expect(eventsOf(envId, 'step_started').map((e) => e.metadata)).toEqual([
        { step: 1, signing_order: 1, signer_ids: [signerIds['ada'], signerIds['bea']] },
      ]);

      const step1 = await dispatchSignLinks(app, [envId]);
      expect(step1.map((l) => l.to).sort()).toEqual(['ada@example.com', 'bea@example.com']);

      // Step 2 has no link. Even a link that reached Cy another way, and a
      // manual reminder, are refused until step 2 starts.
      const tokens = app.get(SigningTokenService);
      const early = tokens.generate();
      envelopesRepo.setSignerTokenHash(signerIds['cy']!, tokens.hash(early));
      const tooEarly = await startSession(envId, early);
      expect(tooEarly.status).toBe(409);
      expect(tooEarly.body).toEqual({ error: 'not_your_turn' });
      const remind = await http()
        .post(`/envelopes/${envId}/signers/${signerIds['cy']}/remind`)
        .set(auth);
      expect(remind.status).toBe(409);
      expect(remind.body).toEqual({ error: 'not_your_turn' });

      const adaLink = step1.find((l) => l.to === 'ada@example.com')!;
      const beaLink = step1.find((l) => l.to === 'bea@example.com')!;
      const first = await signWith(envId, adaLink.token);
      expect(first.body).toEqual({ status: 'submitted', envelope_status: 'awaiting_others' });
      // Bea has not signed yet: still no step 2.
      expect(invitesTo(envId)).toEqual(['ada@example.com', 'bea@example.com']);
      expect(eventsOf(envId, 'step_started')).toHaveLength(1);

      const second = await signWith(envId, beaLink.token);
      expect(second.body).toEqual({ status: 'submitted', envelope_status: 'awaiting_others' });
      expect(invitesTo(envId)).toEqual(['ada@example.com', 'bea@example.com', 'cy@example.com']);
      const started = eventsOf(envId, 'step_started');
      expect(started.map((e) => e.metadata)).toEqual([
        { step: 1, signing_order: 1, signer_ids: [signerIds['ada'], signerIds['bea']] },
        { step: 2, signing_order: 2, signer_ids: [signerIds['cy']] },
      ]);
      const cyInvite = outbound.rows.find((r) => r.to_email === 'cy@example.com')!;
      expect(cyInvite.source_event_id).toBe(started[1]!.id);
      expect(JSON.stringify(cyInvite.payload)).not.toMatch(/[?&]t=/);

      const afterStep1 = await http().get(`/envelopes/${envId}`).set(auth).expect(200);
      const cy = (afterStep1.body.signers as Array<{ name: string; invited_at: unknown }>).find(
        (s) => s.name === 'cy',
      );
      expect(cy?.invited_at).toEqual(expect.any(String));

      const step2 = await dispatchSignLinks(app, [envId]);
      expect(step2.map((l) => l.to)).toEqual(['cy@example.com']);
      const last = await signWith(envId, step2[0]!.token);
      expect(last.body).toEqual({ status: 'submitted', envelope_status: 'sealing' });
      expect(eventsOf(envId, 'all_signed')).toHaveLength(1);

      const chain = await envelopesRepo.verifyEventChain(envId);
      expect(chain.chain_intact).toBe(true);
    });

    it('a decline mid-step ends the envelope; the next step is never invited', async () => {
      const { envId } = await sequentialTwoSteps();
      await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      const links = await dispatchSignLinks(app, [envId]);
      const ada = links.find((l) => l.to === 'ada@example.com')!;
      const bea = links.find((l) => l.to === 'bea@example.com')!;

      await signWith(envId, ada.token);
      const started = await startSession(envId, bea.token);
      const setCookie = started.headers['set-cookie'] as unknown as string[] | string;
      const cookie = (Array.isArray(setCookie) ? setCookie[0]! : setCookie).split(';')[0]!;
      const declined = await http()
        .post('/sign/decline')
        .set('Cookie', cookie)
        .send({ reason: 'no' });
      expect(declined.status).toBe(200);
      expect(declined.body.envelope_status).toBe('declined');

      expect(invitesTo(envId)).toEqual(['ada@example.com', 'bea@example.com']);
      expect(eventsOf(envId, 'step_started')).toHaveLength(1);
    });

    it('reminders skip a later step even if it holds a link', async () => {
      const { envId, signerIds } = await sequentialTwoSteps();
      await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      await dispatchSignLinks(app, [envId]);
      // Simulate a link minted for Cy out of turn, then age every invite.
      await envelopesRepo.rotateSignerAccessToken(signerIds['cy']!, 'f'.repeat(64));
      const aged = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
      for (const id of Object.values(signerIds)) envelopesRepo.backdateInvite(id, aged);
      for (const row of outbound.rows) (row as { created_at: string }).created_at = aged;

      const sweep = await app.get(ReminderSchedulerService).enqueueDue(new Date(), 50);
      expect(sweep.queued).toBe(2);
      const reminded = outbound.rows
        .filter((r) => r.kind === 'reminder')
        .map((r) => r.to_email)
        .sort();
      expect(reminded).toEqual(['ada@example.com', 'bea@example.com']);
    });

    it('the step sweep resumes a step whose start failed after the submit committed', async () => {
      const { envId, signerIds } = await sequentialTwoSteps();
      await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      const links = await dispatchSignLinks(app, [envId]);
      const startStep = jest
        .spyOn(app.get(SigningOrderService), 'startStep')
        .mockRejectedValueOnce(new Error('db down'));
      for (const link of links) await signWith(envId, link.token);
      startStep.mockRestore();
      // Step 2 is stamped invited, but nobody was told.
      expect(invitesTo(envId)).toEqual(['ada@example.com', 'bea@example.com']);
      expect(envelopesRepo.invitedAt.get(signerIds['cy']!)).toEqual(expect.any(String));

      const sweep = () =>
        http().post('/internal/cron/step-sweep').set('X-Cron-Secret', CRON_SECRET);
      // Too fresh to touch.
      expect((await sweep().expect(200)).body.resumed).toBe(0);

      const aged = new Date(Date.now() - 10 * 60_000).toISOString();
      envelopesRepo.invitedAt.set(signerIds['cy']!, aged);
      const res = await sweep().expect(200);
      expect(res.body).toMatchObject({ resumed: 1, resumed_envelope_ids: [envId] });
      expect(invitesTo(envId)).toEqual(['ada@example.com', 'bea@example.com', 'cy@example.com']);
      expect(eventsOf(envId, 'step_started')).toHaveLength(2);

      // Idempotent: a later pass does nothing more.
      envelopesRepo.invitedAt.set(signerIds['cy']!, aged);
      expect((await sweep().expect(200)).body.resumed).toBe(0);
      expect(eventsOf(envId, 'step_started')).toHaveLength(2);
      const step2 = await dispatchSignLinks(app, [envId]);
      expect(step2.map((l) => l.to)).toEqual(['cy@example.com']);
    });

    it('the step-sweep route needs the cron secret', async () => {
      const res = await http().post('/internal/cron/step-sweep').set('X-Cron-Secret', 'nope');
      expect(res.status).toBe(401);
    });

    it('a parallel envelope invites everyone at send, as before', async () => {
      const { envId } = await buildDraft(['ada', 'bea']);
      await http()
        .put(`/envelopes/${envId}/signing-order`)
        .set(auth)
        .send({ delivery_mode: 'parallel' })
        .expect(200);
      const sent = await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      expect(sent.body.delivery_mode).toBe('parallel');
      expect(
        (sent.body.signers as Array<{ invited_at: string | null }>).every(
          (s) => typeof s.invited_at === 'string',
        ),
      ).toBe(true);
      expect(invitesTo(envId)).toEqual(['ada@example.com', 'bea@example.com']);
      expect(eventsOf(envId, 'step_started')).toHaveLength(0);
    });

    it('validates the order body', async () => {
      const { envId, signerIds } = await buildDraft(['ada', 'bea']);
      const missing = await http()
        .put(`/envelopes/${envId}/signing-order`)
        .set(auth)
        .send({
          delivery_mode: 'sequential',
          signers: [{ signer_id: signerIds['ada'], signing_order: 1 }],
        });
      expect(missing.status).toBe(400);
      expect(missing.body).toEqual({ error: 'signing_order_invalid' });

      const badMode = await http()
        .put(`/envelopes/${envId}/signing-order`)
        .set(auth)
        .send({ delivery_mode: 'roundrobin' });
      expect(badMode.status).toBe(400);

      const zero = await http()
        .put(`/envelopes/${envId}/signing-order`)
        .set(auth)
        .send({
          delivery_mode: 'sequential',
          signers: [
            { signer_id: signerIds['ada'], signing_order: 0 },
            { signer_id: signerIds['bea'], signing_order: 1 },
          ],
        });
      expect(zero.status).toBe(400);

      await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      const sentAlready = await http()
        .put(`/envelopes/${envId}/signing-order`)
        .set(auth)
        .send({ delivery_mode: 'sequential' });
      expect(sentAlready.status).toBe(409);
      expect(sentAlready.body).toEqual({ error: 'envelope_not_draft' });
    });
  });

  describe('flag off', () => {
    it('404s the route and leaves responses and send unchanged', async () => {
      const { envId } = await buildDraft(['ada', 'bea']);
      const res = await http()
        .put(`/envelopes/${envId}/signing-order`)
        .set(auth)
        .send({ delivery_mode: 'sequential' });
      expect(res.status).toBe(404);
      const sweep = await http()
        .post('/internal/cron/step-sweep')
        .set('X-Cron-Secret', CRON_SECRET);
      expect(sweep.status).toBe(404);

      // A draft stored as sequential (flag flipped off before send) still
      // sends in parallel.
      const stored = envelopesRepo.envelopes.get(envId)!;
      envelopesRepo.envelopes.set(envId, {
        ...stored,
        delivery_mode: 'sequential',
        signers: stored.signers.map((s, i) => ({ ...s, signing_order: i + 1 })),
      });
      const sent = await http().post(`/envelopes/${envId}/send`).set(auth).expect(201);
      expect(sent.body.delivery_mode).toBe('parallel');
      for (const s of sent.body.signers as Array<Record<string, unknown>>) {
        expect(s).not.toHaveProperty('invited_at');
        expect(s).not.toHaveProperty('step');
      }
      expect(invitesTo(envId)).toEqual(['ada@example.com', 'bea@example.com']);
      expect(eventsOf(envId, 'step_started')).toHaveLength(0);
    });
  });
});
