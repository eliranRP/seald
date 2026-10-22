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
import { EmailDispatcherService } from '../src/email/email-dispatcher.service';
import { EmailSender, type EmailMessage } from '../src/email/email-sender';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';

/**
 * MCP Insert A acceptance scanner: after every path that queues or sends
 * a signer mail (send, retry, manual remind, automated reminder, cancel),
 * no stored outbox row and no audit event holds a signer token, a
 * token-shaped string, a `?t=` link, or a `sign_url` key. The tokens the
 * dispatcher actually emailed are captured and searched for verbatim.
 */
const CRON_SECRET = 's'.repeat(48);

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
  CRON_SECRET,
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

const USER_A = '00000000-0000-0000-0000-00000000000a';
const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

/** A standalone run of exactly 43 base64url characters: the token shape. */
const TOKEN_SHAPED = /(?:^|[^A-Za-z0-9_-])([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/;
const SIGN_LINK_TOKEN = /\/sign\/[0-9a-f-]{36}\?t=([A-Za-z0-9_-]{43})/;

/** Every string leaf in `value`, with its JSON path. */
function stringLeaves(value: unknown, path = '$'): Array<{ path: string; text: string }> {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((item, i) => stringLeaves(item, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => stringLeaves(item, `${path}.${key}`));
  }
  return [];
}

/** Paths in `stored` that hold a key named sign_url or a token-like value. */
function scan(stored: unknown, emailedTokens: readonly string[]): string[] {
  const findings: string[] = [];
  const json = JSON.stringify(stored);
  if (/"sign_url"\s*:/.test(json)) findings.push('sign_url key present');
  for (const { path, text } of stringLeaves(stored)) {
    if (/[?&]t=/.test(text)) findings.push(`${path}: ?t= link`);
    const shaped = TOKEN_SHAPED.exec(text);
    if (shaped) findings.push(`${path}: token-shaped "${shaped[1]}"`);
    for (const token of emailedTokens) {
      if (text.includes(token)) findings.push(`${path}: emailed token`);
    }
  }
  return findings;
}

describe('Outbox signer-token scanner (Insert A, e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let contactsRepo: InMemoryContactsRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let tokenA: string;
  let tinyPdf: Buffer;

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
      .overrideProvider(EnvelopeDocumentsRepository)
      .useValue(new InMemoryEnvelopeDocumentsRepository(envelopesRepo))
      .overrideProvider(ContactsRepository)
      .useValue(contactsRepo)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(OutboundEmailsRepository)
      .useValue(outbound)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    tokenA = await tk.sign(
      { sub: USER_A, email: 'sender@example.com' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );

    const doc = await PDFDocument.create();
    doc.addPage([300, 200]);
    tinyPdf = Buffer.from(await doc.save());
  });

  afterAll(async () => {
    await app.close();
  });

  it('stores no signer token anywhere across send, retry, remind, reminder sweep and cancel', async () => {
    const auth = { Authorization: `Bearer ${tokenA}` };
    const server = app.getHttpServer();
    const env = await request(server).post('/envelopes').set(auth).send({ title: 'Scan me' });
    const envId = env.body.id as string;
    await request(server)
      .post(`/envelopes/${envId}/upload`)
      .set(auth)
      .attach('file', tinyPdf, { filename: 't.pdf', contentType: 'application/pdf' });
    const signerIds: string[] = [];
    for (const [name, email] of [
      ['Ada', 'ada@example.com'],
      ['Bob', 'bob@example.com'],
    ] as const) {
      const contact = await contactsRepo.create({
        owner_id: USER_A,
        name,
        email,
        color: '#112233',
      });
      const signer = await request(server)
        .post(`/envelopes/${envId}/signers`)
        .set(auth)
        .send({ contact_id: contact.id });
      signerIds.push(signer.body.id as string);
    }
    await request(server)
      .put(`/envelopes/${envId}/fields`)
      .set(auth)
      .send({
        fields: signerIds.map((signer_id, i) => ({
          signer_id,
          kind: 'signature',
          page: 1,
          x: 0.1 + i * 0.3,
          y: 0.1,
          required: true,
        })),
      });
    expect((await request(server).post(`/envelopes/${envId}/send`).set(auth)).status).toBe(201);

    // Drain with a sender that fails the first attempt transiently, so the
    // retry path (re-mint) is exercised too.
    const emailed: string[] = [];
    const sent: EmailMessage[] = [];
    let failNext = true;
    const sender = app.get(EmailSender);
    const spy = jest.spyOn(sender, 'send').mockImplementation(async (msg: EmailMessage) => {
      const token = SIGN_LINK_TOKEN.exec(msg.text)?.[1];
      if (token) emailed.push(token);
      if (failNext) {
        failNext = false;
        throw new Error('network_flap');
      }
      sent.push(msg);
      return { providerId: `test-${msg.idempotencyKey}` };
    });
    const dispatcher = app.get(EmailDispatcherService);
    const drain = async (): Promise<void> => {
      // Make retried rows due now instead of after real backoff.
      for (let i = 0; i < outbound.rows.length; i += 1) {
        const row = outbound.rows[i]!;
        if (row.status === 'pending') {
          outbound.rows[i] = { ...row, scheduled_for: new Date(0).toISOString() };
        }
      }
      await dispatcher.flushOnce(500, { envelopeIds: [envId] });
    };
    const age = (): void => {
      const aged = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      for (const id of signerIds) envelopesRepo.backdateInvite(id, aged);
      for (let i = 0; i < outbound.rows.length; i += 1) {
        outbound.rows[i] = { ...outbound.rows[i]!, created_at: aged };
      }
    };

    try {
      await drain(); // first invite fails transiently, second goes out
      await drain(); // retried invite re-mints and goes out
      expect(outbound.rows.filter((r) => r.kind === 'invite' && r.status === 'sent')).toHaveLength(
        2,
      );

      age();
      const remind = await request(server)
        .post(`/envelopes/${envId}/signers/${signerIds[0]}/remind`)
        .set(auth);
      expect(remind.status).toBe(202);
      await drain();

      age();
      const sweep = await request(server)
        .post('/internal/cron/reminders')
        .set('x-cron-secret', CRON_SECRET);
      expect(sweep.status).toBe(200);
      expect(sweep.body.queued).toBe(2);
      await drain();

      expect((await request(server).post(`/envelopes/${envId}/cancel`).set(auth)).status).toBe(201);
      await drain();
    } finally {
      spy.mockRestore();
    }

    // 2 invites + 1 retried invite + 1 manual reminder + 2 automated.
    expect(emailed).toHaveLength(6);
    expect(new Set(emailed).size).toBe(6);
    expect(outbound.rows.map((r) => r.kind).sort()).toEqual([
      'invite',
      'invite',
      'reminder',
      'reminder',
      'reminder',
      'withdrawn_to_signer',
      'withdrawn_to_signer',
    ]);

    const events = await request(server).get(`/envelopes/${envId}/events`).set(auth);
    expect(events.status).toBe(200);
    expect(scan(outbound.rows, emailed)).toEqual([]);
    expect(scan(events.body, emailed)).toEqual([]);
  });

  it('flags a token-shaped value, a ?t= link and a sign_url key (scanner self-test)', () => {
    const token = 'A'.repeat(43);
    expect(scan([{ payload: { note: `x ${token} y` } }], [])).toHaveLength(1);
    expect(scan([{ payload: { cta: 'https://x/sign/e?t=abc' } }], [])).toHaveLength(1);
    expect(scan([{ payload: { sign_url: '' } }], [])).toEqual(['sign_url key present']);
    expect(scan([{ payload: { note: 'short' } }], ['short'])).toEqual([
      '$[0].payload.note: emailed token',
    ]);
  });
});
