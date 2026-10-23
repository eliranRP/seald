import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { DirectLinkRateLimiter } from '../src/direct-links/direct-link-rate-limiter';
import { DirectLinksRepository } from '../src/direct-links/direct-links.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { AccessAuthRepository } from '../src/signing/access-auth/access-auth.repository';
import { StepSweepRepository } from '../src/signing/step-sweep.service';
import { StorageService } from '../src/storage/storage.service';
import { TemplatesRepository } from '../src/templates/templates.repository';
import { dispatchSignLinks } from './dispatched-sign-links';
import { InMemoryAccessAuthRepository } from './in-memory-access-auth-repository';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryDirectLinksRepository } from './in-memory-direct-links-repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStepSweepRepository } from './in-memory-step-sweep-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { InMemoryTemplatesRepository } from './in-memory-templates-repository';
import { setFlag } from './pades-e2e-harness';
import { stubGdriveForEnvelopeDetail } from './stub-gdrive-for-envelope-detail';
import { buildTestJwks } from './test-jwks';

/**
 * WP-37 template direct links, end to end through AppModule with in-memory
 * repos: owner routes, the public page, claim, and the abuse limits.
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
};

const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TOKEN_RE = /^dl_[A-Za-z0-9_-]{43}$/;

const SLOT_OWNER = 's-owner';
const SLOT_GUEST = 's-guest';

describe('Template direct links (WP-37, e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let outbound: InMemoryOutboundEmailsRepository;
  let templates: InMemoryTemplatesRepository;
  let links: InMemoryDirectLinksRepository;
  let storage: InMemoryStorageService;
  let accessRepo: InMemoryAccessAuthRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let auth: { Authorization: string };
  let authOther: { Authorization: string };
  let pdf: Buffer;

  beforeAll(async () => {
    tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();
    outbound = new InMemoryOutboundEmailsRepository();
    templates = new InMemoryTemplatesRepository();
    links = new InMemoryDirectLinksRepository();
    storage = new InMemoryStorageService();
    accessRepo = new InMemoryAccessAuthRepository(envelopesRepo);

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
      .overrideProvider(TemplatesRepository)
      .useValue(templates)
      .overrideProvider(DirectLinksRepository)
      .useValue(links)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outbound)
      .overrideProvider(StepSweepRepository)
      .useValue(new InMemoryStepSweepRepository(envelopesRepo, outbound))
      .overrideProvider(AccessAuthRepository)
      .useValue(accessRepo)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const sign = (sub: string, email: string) =>
      tk.sign({ sub, email }, { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE });
    auth = { Authorization: `Bearer ${await sign(OWNER, 'owner@example.com')}` };
    authOther = { Authorization: `Bearer ${await sign(OTHER, 'other@example.com')}` };

    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    doc.addPage([612, 792]);
    pdf = Buffer.from(await doc.save());
  });

  beforeEach(() => {
    envelopesRepo.reset();
    outbound.reset();
    templates.reset();
    links.reset();
    storage.reset();
    app.get(DirectLinkRateLimiter).reset();
    setFlag('directLinks', true);
  });

  afterEach(() => {
    setFlag('directLinks', undefined);
    setFlag('signingOrder', undefined);
    setFlag('signerAccessAuth', undefined);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** A two-slot template with a saved example PDF and a signature field per slot. */
  async function makeTemplate(
    extra: Record<string, unknown> = {},
    opts: { withPdf?: boolean; as?: { Authorization: string } } = {},
  ): Promise<string> {
    const as = opts.as ?? auth;
    const res = await http()
      .post('/templates')
      .set(as)
      .send({
        title: 'Consulting agreement',
        field_layout: [
          { type: 'signature', pageRule: 'last', x: 60, y: 540, signerRoleId: SLOT_OWNER },
          { type: 'signature', pageRule: 'last', x: 320, y: 540, signerRoleId: SLOT_GUEST },
          { type: 'date', pageRule: 'last', x: 320, y: 600, signerRoleId: SLOT_GUEST },
        ],
        last_signers: [
          { id: SLOT_OWNER, name: 'Olive Owner', email: 'olive@example.com', color: '#112233' },
          {
            id: SLOT_GUEST,
            name: 'Slot Guest',
            email: 'placeholder@example.com',
            color: '#445566',
          },
        ],
        ...extra,
      })
      .expect(201);
    const id = res.body.id as string;
    if (opts.withPdf !== false) {
      await http()
        .post(`/templates/${id}/example`)
        .set(as)
        .attach('file', pdf, { filename: 'example.pdf', contentType: 'application/pdf' })
        .expect(200);
    }
    return id;
  }

  async function enable(
    templateId: string,
    body: Record<string, unknown> = {},
  ): Promise<{ token: string; path: string; linkId: string }> {
    const res = await http()
      .post(`/templates/${templateId}/direct-link`)
      .set(auth)
      .send({ signer_slot: SLOT_GUEST, ...body })
      .expect(201);
    return {
      token: res.body.token as string,
      path: res.body.path as string,
      linkId: res.body.link.id as string,
    };
  }

  const claim = (token: string, body: Record<string, unknown>, ip = '203.0.113.10') =>
    http().post(`/direct-links/${token}/claim`).set('X-Forwarded-For', ip).send(body);

  const visitor = (n: number) => ({ name: `Visitor ${n}`, email: `visitor${n}@example.org` });

  function envelopesOfOwner() {
    return [...envelopesRepo.envelopes.values()].filter((e) => e.owner_id === OWNER);
  }

  describe('flag off', () => {
    it('404s every route', async () => {
      setFlag('directLinks', false);
      const t = await makeTemplate();
      await http().get(`/templates/${t}/direct-link`).set(auth).expect(404);
      await http()
        .post(`/templates/${t}/direct-link`)
        .set(auth)
        .send({ signer_slot: SLOT_GUEST })
        .expect(404);
      await http()
        .get(`/direct-links/dl_${'a'.repeat(43)}`)
        .expect(404);
      await http()
        .post(`/direct-links/dl_${'a'.repeat(43)}/claim`)
        .send(visitor(1))
        .expect(404);
    });
  });

  describe('owner routes', () => {
    it('requires a session', async () => {
      const t = await makeTemplate();
      await http().get(`/templates/${t}/direct-link`).expect(401);
      await http()
        .post(`/templates/${t}/direct-link`)
        .send({ signer_slot: SLOT_GUEST })
        .expect(401);
    });

    it('creates a link with a 256-bit token that is returned once and never stored', async () => {
      const t = await makeTemplate();
      const res = await http()
        .post(`/templates/${t}/direct-link`)
        .set(auth)
        .send({ signer_slot: SLOT_GUEST, sender_name: 'Olive' })
        .expect(201);
      expect(res.body.token).toMatch(TOKEN_RE);
      expect(res.body.path).toBe(`/d/${res.body.token}`);
      expect(res.body.link).toMatchObject({
        template_id: t,
        signer_slot: SLOT_GUEST,
        enabled: true,
        sender_name: 'Olive',
        daily_cap: 50,
        created_last_24h: 0,
      });
      expect(JSON.stringify(res.body.link)).not.toContain(res.body.token);
      expect(JSON.stringify(res.body.link)).not.toContain('token_hash');

      const got = await http().get(`/templates/${t}/direct-link`).set(auth).expect(200);
      expect(got.body.link.prefix).toBe((res.body.token as string).slice(0, 9));
      expect(JSON.stringify(got.body)).not.toContain(res.body.token);
    });

    it('returns link null before one exists, and 409 on a second create', async () => {
      const t = await makeTemplate();
      const none = await http().get(`/templates/${t}/direct-link`).set(auth).expect(200);
      expect(none.body).toEqual({ link: null });
      await enable(t);
      await http()
        .post(`/templates/${t}/direct-link`)
        .set(auth)
        .send({ signer_slot: SLOT_GUEST })
        .expect(409);
    });

    it('rejects a template without a saved PDF, an unknown slot and a slot without a signature field', async () => {
      const noPdf = await makeTemplate({}, { withPdf: false });
      const a = await http()
        .post(`/templates/${noPdf}/direct-link`)
        .set(auth)
        .send({ signer_slot: SLOT_GUEST });
      expect(a.status).toBe(422);
      expect(a.body.message ?? a.body.error).toContain('template_needs_example_pdf');

      const t = await makeTemplate();
      await http()
        .post(`/templates/${t}/direct-link`)
        .set(auth)
        .send({ signer_slot: 'nope' })
        .expect(400);

      const unsigned = await makeTemplate({
        field_layout: [
          { type: 'signature', pageRule: 'last', x: 60, y: 540, signerRoleId: SLOT_OWNER },
          { type: 'date', pageRule: 'last', x: 320, y: 600, signerRoleId: SLOT_GUEST },
        ],
      });
      await http()
        .post(`/templates/${unsigned}/direct-link`)
        .set(auth)
        .send({ signer_slot: SLOT_GUEST })
        .expect(422);
    });

    it("does not reveal or touch another owner's template", async () => {
      const t = await makeTemplate();
      await enable(t);
      await http().get(`/templates/${t}/direct-link`).set(authOther).expect(404);
      await http()
        .patch(`/templates/${t}/direct-link`)
        .set(authOther)
        .send({ enabled: false })
        .expect(404);
      await http().post(`/templates/${t}/direct-link/rotate`).set(authOther).expect(404);
      await http().delete(`/templates/${t}/direct-link`).set(authOther).expect(404);
    });

    it('validates input', async () => {
      const t = await makeTemplate();
      await http().post(`/templates/${t}/direct-link`).set(auth).send({}).expect(400);
      await http()
        .post(`/templates/${t}/direct-link`)
        .set(auth)
        .send({ signer_slot: SLOT_GUEST, daily_cap: 0 })
        .expect(400);
      await http()
        .post(`/templates/${t}/direct-link`)
        .set(auth)
        .send({ signer_slot: SLOT_GUEST, daily_cap: 5000 })
        .expect(400);
      await http().get('/templates/not-a-uuid/direct-link').set(auth).expect(400);
    });
  });

  describe('public page', () => {
    it('shows only the template title and the sender name', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t, { sender_name: 'Olive Owner' });
      const res = await http().get(`/direct-links/${token}`).expect(200);
      expect(res.body).toEqual({
        template_title: 'Consulting agreement',
        sender_name: 'Olive Owner',
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('falls back to a generic sender label', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t);
      const res = await http().get(`/direct-links/${token}`).expect(200);
      expect(res.body.sender_name).toBe('A Seald user');
    });

    it('404s a malformed, unknown, disabled or revoked token the same way', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t);
      const bodies: unknown[] = [];
      for (const bad of ['short', `dl_${'z'.repeat(43)}`, `xx_${'a'.repeat(43)}`]) {
        const res = await http().get(`/direct-links/${bad}`).expect(404);
        bodies.push(res.body);
      }
      await http()
        .patch(`/templates/${t}/direct-link`)
        .set(auth)
        .send({ enabled: false })
        .expect(200);
      bodies.push((await http().get(`/direct-links/${token}`).expect(404)).body);
      expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    });
  });

  describe('claim', () => {
    it('creates an envelope from the template with the visitor in the bound slot', async () => {
      const t = await makeTemplate();
      const { token, linkId } = await enable(t, { sender_name: 'Olive' });

      const res = await claim(token, { name: ' Ada  Lovelace ', email: 'Ada@Example.org' }).expect(
        200,
      );
      expect(res.body).toEqual({ status: 'check_your_email' });

      const envs = envelopesOfOwner();
      expect(envs).toHaveLength(1);
      const env = envs[0]!;
      expect(env.title).toBe('Consulting agreement');
      expect(env.status).toBe('awaiting_others');
      expect(env.sender_email).toBe('owner@example.com');
      expect(env.signers.map((s) => [s.name, s.email])).toEqual([
        ['Olive Owner', 'olive@example.com'],
        ['Ada Lovelace', 'ada@example.org'],
      ]);
      // Layout applied on the server: one signature per slot (+ the guest date).
      const ownerSigner = env.signers[0]!;
      const guestSigner = env.signers[1]!;
      expect(env.fields.filter((f) => f.signer_id === ownerSigner.id).map((f) => f.kind)).toEqual([
        'signature',
      ]);
      expect(
        env.fields
          .filter((f) => f.signer_id === guestSigner.id)
          .map((f) => f.kind)
          .sort(),
      ).toEqual(['date', 'signature']);
      const sig = env.fields.find((f) => f.signer_id === ownerSigner.id)!;
      expect(sig.page).toBe(2);
      expect(sig.x).toBeCloseTo(60 / 560, 3);
      expect(sig.y).toBeCloseTo(540 / (560 * (792 / 612)), 3);

      // Provenance for the pg adapter to stamp.
      expect(links.provenance.get(env.id)).toEqual({
        envelope_id: env.id,
        template_id: t,
        direct_link_id: linkId,
      });
      // Template use counter bumped.
      expect((await http().get(`/templates/${t}`).set(auth)).body.uses_count).toBe(1);
      // The owner's dashboard sees the link's usage.
      const link = await http().get(`/templates/${t}/direct-link`).set(auth).expect(200);
      expect(link.body.link.created_last_24h).toBe(1);
    });

    it('sends the visitor a normal signing link, proving email control', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t);
      await claim(token, visitor(1)).expect(200);
      const sent = await dispatchSignLinks(app);
      const toVisitor = sent.filter((l) => l.to === 'visitor1@example.org');
      expect(toVisitor).toHaveLength(1);
      expect(toVisitor[0]!.envelopeId).toBe(envelopesOfOwner()[0]!.id);
      // The owner's slot signer is invited as configured (parallel mode).
      expect(sent.map((l) => l.to).sort()).toEqual(['olive@example.com', 'visitor1@example.org']);
    });

    it('records the visitor IP on the envelope events', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t);
      await claim(token, visitor(1), '198.51.100.7').expect(200);
      const env = envelopesOfOwner()[0]!;
      const sent = envelopesRepo.events.filter(
        (e) => e.envelope_id === env.id && e.event_type === 'sent',
      );
      expect(sent.length).toBeGreaterThan(0);
      expect(sent.every((e) => e.ip === '198.51.100.7')).toBe(true);
    });

    it('answers a repeat of the same address like a success without a second envelope', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t);
      await claim(token, { name: 'Ada', email: 'ada@example.org' }).expect(200);
      const again = await claim(token, { name: 'Ada', email: 'ADA@example.org' }).expect(200);
      expect(again.body).toEqual({ status: 'check_your_email' });
      expect(envelopesOfOwner()).toHaveLength(1);
    });

    it('takes no prefill: unknown fields are rejected, and bad input is 400', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t);
      await claim(token, { ...visitor(1), role: 'admin' }).expect(400);
      await claim(token, { name: 'Ada', email: 'not-an-email' }).expect(400);
      await claim(token, { name: '', email: 'ada@example.org' }).expect(400);
      await claim(token, { name: '<>', email: 'ada@example.org' }).expect(400);
      expect(envelopesOfOwner()).toHaveLength(0);
      expect(links.claimCount()).toBe(0);
    });

    it('refuses an address that is another slot, releases the claim, and leaves no draft behind', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t);
      const res = await claim(token, { name: 'Olive', email: 'olive@example.com' });
      expect(res.status).toBe(400);
      expect(envelopesOfOwner()).toHaveLength(0);
      expect(links.claimCount()).toBe(0);
      await claim(token, visitor(2)).expect(200);
    });

    it('404s once the link is disabled, and works again at the same URL when re-enabled', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t);
      await http()
        .patch(`/templates/${t}/direct-link`)
        .set(auth)
        .send({ enabled: false })
        .expect(200);
      await claim(token, visitor(1)).expect(404);
      await http().get(`/direct-links/${token}`).expect(404);
      expect(envelopesOfOwner()).toHaveLength(0);
      await http()
        .patch(`/templates/${t}/direct-link`)
        .set(auth)
        .send({ enabled: true })
        .expect(200);
      await claim(token, visitor(1)).expect(200);
      expect(envelopesOfOwner()).toHaveLength(1);
    });

    it('rotating the URL kills the old token and keeps the settings', async () => {
      const t = await makeTemplate();
      const first = await enable(t, { daily_cap: 7, sender_name: 'Olive' });
      const rotated = await http().post(`/templates/${t}/direct-link/rotate`).set(auth).expect(200);
      const next = rotated.body.token as string;
      expect(next).toMatch(TOKEN_RE);
      expect(next).not.toBe(first.token);
      expect(rotated.body.link).toMatchObject({
        daily_cap: 7,
        sender_name: 'Olive',
        enabled: true,
      });
      await http().get(`/direct-links/${first.token}`).expect(404);
      await claim(first.token, visitor(1)).expect(404);
      await http().get(`/direct-links/${next}`).expect(200);
      await claim(next, visitor(1)).expect(200);
    });

    it('rotating keeps a disabled link disabled', async () => {
      const t = await makeTemplate();
      await enable(t);
      await http()
        .patch(`/templates/${t}/direct-link`)
        .set(auth)
        .send({ enabled: false })
        .expect(200);
      const rotated = await http().post(`/templates/${t}/direct-link/rotate`).set(auth).expect(200);
      expect(rotated.body.link.enabled).toBe(false);
      await http().get(`/direct-links/${rotated.body.token}`).expect(404);
    });

    it('deleting the link revokes the token for good and allows a fresh link', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t);
      await http().delete(`/templates/${t}/direct-link`).set(auth).expect(204);
      await http().get(`/direct-links/${token}`).expect(404);
      await http().get(`/templates/${t}/direct-link`).set(auth).expect(200).expect({ link: null });
      const again = await enable(t);
      expect(again.token).not.toBe(token);
    });

    it('404s when the template was deleted or lost its example PDF or slot', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t);
      await http()
        .patch(`/templates/${t}`)
        .set(auth)
        .send({
          last_signers: [
            { id: SLOT_OWNER, name: 'Olive Owner', email: 'olive@example.com', color: '#112233' },
          ],
        })
        .expect(200);
      await http().get(`/direct-links/${token}`).expect(404);
      await http().delete(`/templates/${t}`).set(auth).expect(204);
      await claim(token, visitor(1)).expect(404);
    });
  });

  describe('abuse limits', () => {
    it('stops at the link daily cap with 429 and Retry-After, then recovers after 24 hours', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t, { daily_cap: 2 });
      await claim(token, visitor(1), '203.0.113.1').expect(200);
      await claim(token, visitor(2), '203.0.113.2').expect(200);
      const over = await claim(token, visitor(3), '203.0.113.3');
      expect(over.status).toBe(429);
      expect(over.body.message ?? over.body.error).toContain('direct_link_daily_cap');
      expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
      expect(envelopesOfOwner()).toHaveLength(2);

      links.ageClaims(25 * 60 * 60 * 1000);
      await claim(token, visitor(3), '203.0.113.3').expect(200);
      expect(envelopesOfOwner()).toHaveLength(3);
    });

    it('limits one IP across attempts, with Retry-After', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t, { daily_cap: 1000 });
      for (let i = 1; i <= 10; i++) await claim(token, visitor(i), '198.51.100.99').expect(200);
      const over = await claim(token, visitor(11), '198.51.100.99');
      expect(over.status).toBe(429);
      expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
      // Another address is unaffected.
      await claim(token, visitor(12), '198.51.100.100').expect(200);
    });

    it('counts guesses at bad tokens against the IP too', async () => {
      for (let i = 0; i < 10; i++) {
        await http()
          .post(`/direct-links/dl_${'q'.repeat(43)}/claim`)
          .set('X-Forwarded-For', '192.0.2.5')
          .send(visitor(i))
          .expect(404);
      }
      await http()
        .post(`/direct-links/dl_${'q'.repeat(43)}/claim`)
        .set('X-Forwarded-For', '192.0.2.5')
        .send(visitor(11))
        .expect(429);
    });

    it('limits one link across many IPs', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t, { daily_cap: 1000 });
      for (let i = 1; i <= 60; i++) {
        await claim(token, visitor(i), `10.0.${Math.floor(i / 200)}.${i}`).expect(200);
      }
      const over = await claim(token, visitor(61), '10.9.9.9');
      expect(over.status).toBe(429);
    });
  });

  describe('signing order and access code', () => {
    it('applies the template signing order: later steps are not invited yet', async () => {
      setFlag('signingOrder', true);
      // The visitor's slot signs second; the owner's slot signs first.
      const t = await makeTemplate({
        delivery_mode: 'sequential',
        last_signers: [
          {
            id: SLOT_OWNER,
            name: 'Olive Owner',
            email: 'olive@example.com',
            color: '#112233',
            signing_order: 1,
          },
          {
            id: SLOT_GUEST,
            name: 'Slot Guest',
            email: 'placeholder@example.com',
            color: '#445566',
            signing_order: 2,
          },
        ],
      });
      const tpl = await http().get(`/templates/${t}`).set(auth).expect(200);
      expect(tpl.body.delivery_mode).toBe('sequential');
      const { token } = await enable(t);
      await claim(token, visitor(1)).expect(200);

      const env = envelopesOfOwner()[0]!;
      expect(env.delivery_mode).toBe('sequential');
      expect(env.signers.map((s) => [s.email, s.signing_order])).toEqual([
        ['olive@example.com', 1],
        ['visitor1@example.org', 2],
      ]);
      const invited = outbound.rows
        .filter((r) => r.envelope_id === env.id && r.kind === 'invite')
        .map((r) => r.to_email);
      expect(invited).toEqual(['olive@example.com']);
    });

    it('ignores the template order while signingOrder is off', async () => {
      const t = await makeTemplate();
      const { token } = await enable(t);
      await claim(token, visitor(1)).expect(200);
      const env = envelopesOfOwner()[0]!;
      expect(env.delivery_mode).toBe('parallel');
      const invited = outbound.rows
        .filter((r) => r.envelope_id === env.id && r.kind === 'invite')
        .map((r) => r.to_email)
        .sort();
      expect(invited).toEqual(['olive@example.com', 'visitor1@example.org']);
    });

    it('requires the emailed code for the visitor while signerAccessAuth is on', async () => {
      setFlag('signerAccessAuth', true);
      const t = await makeTemplate();
      const { token } = await enable(t);
      await claim(token, visitor(1)).expect(200);
      const env = envelopesOfOwner()[0]!;
      const visitorSigner = env.signers.find((s) => s.email === 'visitor1@example.org')!;
      const ownerSigner = env.signers.find((s) => s.email === 'olive@example.com')!;
      expect(accessRepo.signerAuth.get(visitorSigner.id)?.access).toBe('email_otp');
      expect(accessRepo.signerAuth.get(ownerSigner.id)?.access ?? null).toBeNull();
    });
  });

  describe('template signing order (WP-06 gap)', () => {
    it('rejects delivery_mode and signing_order while signingOrder is off, and omits them', async () => {
      setFlag('signingOrder', false);
      const bad = await http()
        .post('/templates')
        .set(auth)
        .send({ title: 'T', field_layout: [], delivery_mode: 'sequential' });
      expect(bad.status).toBe(400);
      const t = await makeTemplate();
      const got = await http().get(`/templates/${t}`).set(auth).expect(200);
      expect(got.body).not.toHaveProperty('delivery_mode');
    });

    it('stores and returns them while signingOrder is on, and validates them', async () => {
      setFlag('signingOrder', true);
      const t = await makeTemplate({ delivery_mode: 'sequential' });
      const patched = await http()
        .patch(`/templates/${t}`)
        .set(auth)
        .send({
          delivery_mode: 'parallel',
          last_signers: [
            { id: 'a', name: 'A', email: 'a@example.com', color: '#112233', signing_order: 2 },
          ],
        })
        .expect(200);
      expect(patched.body.delivery_mode).toBe('parallel');
      expect(patched.body.last_signers[0].signing_order).toBe(2);
      await http()
        .patch(`/templates/${t}`)
        .set(auth)
        .send({ delivery_mode: 'sideways' })
        .expect(400);
      await http()
        .patch(`/templates/${t}`)
        .set(auth)
        .send({
          last_signers: [
            { id: 'a', name: 'A', email: 'a@example.com', color: '#112233', signing_order: 0 },
          ],
        })
        .expect(400);
    });
  });
});
