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
 * E2E coverage of the audit-event hash chain (`prev_event_hash` column).
 *
 * The chain is tamper-evident: every event row stores SHA-256 of the
 * previous row's canonical JSON within the same envelope. Walking the
 * chain in `verifyEventChain` and recomputing the hashes detects any
 * insert / update / delete that bypassed `appendEvent`.
 *
 * What we exercise:
 *  1. A freshly seeded envelope with a sequence of events surfaces
 *     `chain_intact: true` on `GET /verify/:short_code`.
 *  2. After a hand-mutation of an event row's metadata (simulating direct
 *     DB tampering), the same endpoint surfaces `chain_intact: false`.
 *  3. Corrupting just the stored prev_event_hash (without touching the
 *     event rows themselves) is also detected as broken.
 */
describe('envelope-events chain integrity (e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  const USER_A = '00000000-0000-0000-0000-00000000000a';

  beforeAll(async () => {
    const tk = await buildTestJwks();
    envelopesRepo = new InMemoryEnvelopesRepository();
    const contactsRepo = new InMemoryContactsRepository();
    const storage = new InMemoryStorageService();
    const outbound = new InMemoryOutboundEmailsRepository();

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

  let counter = 0;
  async function seedEnvelopeWithEvents(): Promise<{
    readonly id: string;
    readonly short_code: string;
  }> {
    counter += 1;
    // Use base-58 safe chars (no 0, O, I, l, underscores) so the code
    // passes isValidShortCode validation added in PR #200.
    const short_code = `chne2eT${String(counter).padStart(6, '2')}`; // 13 chars, base-58 safe
    const draft = await envelopesRepo.createDraft({
      owner_id: USER_A,
      title: 'Chain integrity envelope',
      short_code,
      tc_version: TEST_ENV.TC_VERSION,
      privacy_version: TEST_ENV.PRIVACY_VERSION,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    // Three events in sequence — first becomes the genesis (prev=null), the
    // following two each chain off their predecessor.
    await envelopesRepo.appendEvent({
      envelope_id: draft.id,
      actor_kind: 'system',
      event_type: 'created',
    });
    await envelopesRepo.appendEvent({
      envelope_id: draft.id,
      actor_kind: 'system',
      event_type: 'sent',
      metadata: { foo: 'bar' },
    });
    await envelopesRepo.appendEvent({
      envelope_id: draft.id,
      actor_kind: 'system',
      event_type: 'viewed',
    });
    return { id: draft.id, short_code };
  }

  it('reports chain_intact=true for an untampered envelope', async () => {
    const env = await seedEnvelopeWithEvents();
    const res = await request(app.getHttpServer()).get(`/verify/${env.short_code}`).expect(200);
    expect(res.body.chain_intact).toBe(true);
  });

  it('reports chain_intact=false after metadata mutation bypasses appendEvent', async () => {
    const env = await seedEnvelopeWithEvents();
    // Find the 'sent' event for this envelope and rewrite its metadata
    // directly on the in-memory store — this is the in-memory analog of a
    // hand-edit `UPDATE envelope_events SET metadata = ... WHERE id = ...`
    // run by an attacker with DB write access.
    const target = envelopesRepo.events.find(
      (ev) => ev.envelope_id === env.id && ev.event_type === 'sent',
    );
    expect(target).toBeDefined();
    target!.metadata = { tampered: true };

    const res = await request(app.getHttpServer()).get(`/verify/${env.short_code}`).expect(200);
    expect(res.body.chain_intact).toBe(false);
  });

  it('reports chain_intact=false when the stored prev_event_hash is corrupted', async () => {
    const env = await seedEnvelopeWithEvents();
    // Pick the 'viewed' event and rewrite its prev_event_hash with bogus
    // bytes — analogous to `UPDATE envelope_events SET prev_event_hash =
    // '\\xdeadbeef...' WHERE id = ...`. The chain walk recomputes the
    // expected hash from the previous event's canonical JSON and finds a
    // mismatch.
    const viewed = envelopesRepo.events.find(
      (ev) => ev.envelope_id === env.id && ev.event_type === 'viewed',
    );
    expect(viewed).toBeDefined();
    envelopesRepo.eventPrevHashes.set(viewed!.id, Buffer.alloc(32, 0xde));

    const res = await request(app.getHttpServer()).get(`/verify/${env.short_code}`).expect(200);
    expect(res.body.chain_intact).toBe(false);
  });
});
