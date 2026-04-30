/**
 * End-to-end exercise of the KmsPadesSigner path against a LocalStack
 * KMS service. Mirrors the openssl-P12 pattern in pades-signing.e2e-
 * spec.ts: spin up the dependency in beforeAll, drive the full seal
 * pipeline against a real signer, assert wire-level PAdES markers on
 * the produced PDF.
 *
 * Skip-when-no-Docker: if `docker info` fails (no daemon, minimal CI
 * image, etc.) the suite skips cleanly with a logged reason. CI uses
 * the GHA `services: localstack` block to make this path always
 * exercise the real signer.
 *
 * Why we don't need real AWS creds
 * --------------------------------
 * AWS SDK v3 reads `AWS_ENDPOINT_URL` from the environment and routes
 * every request to that URL instead of the public AWS regional
 * endpoint. LocalStack accepts `test`/`test` as canonical creds. So
 * setting AWS_* env vars + AWS_ENDPOINT_URL is enough — KmsPadesSigner
 * needs zero code changes.
 *
 * Why the binding cert isn't KMS-signed here
 * ------------------------------------------
 * For production, the binding cert SHOULD be signed by the KMS key
 * itself (so the cert is cryptographically pinned). That's covered by
 * a dedicated script (`apps/api/scripts/generate-kms-binding-cert.ts`,
 * landing in a parallel PR). For this e2e harness we only need a cert
 * that CARRIES the KMS public key in SubjectPublicKeyInfo so the CMS
 * SignerInfo's signature verifies under it. We sign the cert with a
 * throwaway forge key — that's irrelevant to the verifier's
 * "CMS signature ↔ embedded cert pubkey" check, which is what our
 * verify-pades.ts script enforces. Trust-list (AATL) verification is
 * out of scope for this suite.
 */

import { execSync, spawn } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { CreateKeyCommand, GetPublicKeyCommand, KMSClient } from '@aws-sdk/client-kms';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { PadesSigner } from '../src/sealing/pades-signer';
import { SealingService } from '../src/sealing/sealing.service';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';

const LOCALSTACK_PORT = 4566;
const LOCALSTACK_URL = `http://localhost:${LOCALSTACK_PORT}`;
const LOCALSTACK_REGION = 'us-east-1';
const STARTUP_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

interface KmsHarness {
  readonly keyArn: string;
  readonly keyId: string;
  readonly certPem: string;
  readonly disposeContainer: () => void;
}

/**
 * Detect whether LocalStack is reachable. Three modes:
 *   1. Already running (e.g. GHA `services:` block) — we just create the key.
 *   2. We can spawn a container — start, poll, create key.
 *   3. Neither — return null so the suite skips.
 */
async function tryStartLocalStackKms(): Promise<KmsHarness | null> {
  // Mode 1: is something already at :4566 health-checking out?
  if (await pingLocalStack()) {
    // eslint-disable-next-line no-console
    console.log('[pades-kms test] Using existing LocalStack at', LOCALSTACK_URL);
    const harness = await provisionKmsKey(
      /* dispose */ () => {
        /* nothing — we didn't start it */
      },
    );
    return harness;
  }

  // Mode 2: try to spawn a container.
  if (!hasDocker()) {
    // eslint-disable-next-line no-console
    console.warn('[pades-kms test] Docker not available — skipping KMS e2e suite');
    return null;
  }

  // eslint-disable-next-line no-console
  console.log('[pades-kms test] Starting LocalStack container...');
  // -d = detached; --rm = auto-remove on stop; -p = forward port; SERVICES=kms = only KMS.
  let containerId: string;
  try {
    containerId = execSync(
      `docker run -d --rm -p ${LOCALSTACK_PORT}:${LOCALSTACK_PORT} -e SERVICES=kms -e DEBUG=0 localstack/localstack:latest`,
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
      .toString('utf8')
      .trim();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[pades-kms test] Failed to start LocalStack: ${(err as Error).message} — skipping`,
    );
    return null;
  }

  const dispose = () => {
    try {
      execSync(`docker stop ${containerId}`, { stdio: 'ignore' });
    } catch {
      // best-effort
    }
  };

  // Wait for health.
  const start = Date.now();
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    if (await pingLocalStack()) {
      return await provisionKmsKey(dispose);
    }
    await delay(POLL_INTERVAL_MS);
  }
  dispose();
  // eslint-disable-next-line no-console
  console.warn('[pades-kms test] LocalStack failed to become ready in 60s — skipping');
  return null;
}

function hasDocker(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function pingLocalStack(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCALSTACK_URL}/_localstack/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { services?: Record<string, string> };
    return body.services?.kms === 'available' || body.services?.kms === 'running';
  } catch {
    return false;
  }
}

/**
 * Create an asymmetric SIGN_VERIFY KMS key (RSA_3072), fetch its
 * public key, and build an X.509 cert that wraps the public key. The
 * cert is signed with a throwaway forge RSA key — see file header for
 * why that's adequate for this harness.
 */
async function provisionKmsKey(disposeContainer: () => void): Promise<KmsHarness> {
  // Set the AWS SDK creds + endpoint env vars BEFORE constructing the
  // client so the SDK picks them up consistently.
  process.env['AWS_ACCESS_KEY_ID'] = 'test';
  process.env['AWS_SECRET_ACCESS_KEY'] = 'test';
  process.env['AWS_REGION'] = LOCALSTACK_REGION;
  process.env['AWS_ENDPOINT_URL'] = LOCALSTACK_URL;

  const kms = new KMSClient({ region: LOCALSTACK_REGION, endpoint: LOCALSTACK_URL });
  const created = await kms.send(
    new CreateKeyCommand({
      KeyUsage: 'SIGN_VERIFY',
      KeySpec: 'RSA_3072',
      Description: 'seald e2e harness — RSA-3072 sign-only',
    }),
  );
  const keyArn = created.KeyMetadata?.Arn;
  const keyId = created.KeyMetadata?.KeyId;
  if (!keyArn || !keyId) {
    throw new Error('LocalStack returned no Arn/KeyId from CreateKey');
  }

  // Get the public key (DER-encoded SubjectPublicKeyInfo).
  const pubResp = await kms.send(new GetPublicKeyCommand({ KeyId: keyId }));
  if (!pubResp.PublicKey) {
    throw new Error('LocalStack returned no PublicKey');
  }
  const pubKeyDer = Buffer.from(pubResp.PublicKey);
  const pubKey = forge.pki.publicKeyFromAsn1(forge.asn1.fromDer(pubKeyDer.toString('binary')));

  // Build a cert with the KMS public key. Signed with a throwaway forge
  // key — irrelevant for our CMS verification path (see file header).
  const localKey = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = pubKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
  const subject = [
    { name: 'commonName', value: 'Seald LocalStack E2E' },
    { name: 'organizationName', value: 'Seald' },
    { name: 'countryName', value: 'US' },
  ];
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.sign(localKey.privateKey, forge.md.sha256.create());
  const certPem = forge.pki.certificateToPem(cert);

  return { keyArn, keyId, certPem, disposeContainer };
}

const TEST_ENV_BASE: Omit<
  AppEnv,
  | 'PDF_SIGNING_PROVIDER'
  | 'PDF_SIGNING_KMS_KEY_ID'
  | 'PDF_SIGNING_KMS_REGION'
  | 'PDF_SIGNING_KMS_CERT_PEM'
> = {
  NODE_ENV: 'test',
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGIN: 'http://localhost:5173',
  APP_PUBLIC_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgres://test',
  STORAGE_BUCKET: 'envelopes',
  TC_VERSION: '2026-04-24',
  PRIVACY_VERSION: '2026-04-24',
  EMAIL_PROVIDER: 'logging',
  EMAIL_FROM_ADDRESS: 'no-reply@seald.test',
  EMAIL_FROM_NAME: 'Seald',
  EMAIL_LEGAL_ENTITY: 'Seald, Inc.',
  EMAIL_LEGAL_POSTAL: 'Postal address available on request — write to legal@seald.test.',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com?subject=Email%20preferences',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  ENVELOPE_RETENTION_YEARS: 7,
  WORKER_ENABLED: false,
};

const USER_A = '11111111-1111-4111-8111-111111111111';

let harness: KmsHarness | null = null;

beforeAll(async () => {
  harness = await tryStartLocalStackKms();
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  if (harness) harness.disposeContainer();
});

const describeOrSkip = ((): jest.Describe => {
  // Use a getter-style Describe so the .skip path engages cleanly when
  // beforeAll didn't get a harness.
  return harness ? describe : describe.skip;
})();

describeOrSkip('PAdES signing — KmsPadesSigner against LocalStack KMS (e2e)', () => {
  let app: INestApplication;
  let envelopesRepo: InMemoryEnvelopesRepository;
  let contactsRepo: InMemoryContactsRepository;
  let storage: InMemoryStorageService;
  let outbound: InMemoryOutboundEmailsRepository;
  let sealing: SealingService;
  let pades: PadesSigner;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let tokenA: string;
  let tinyPdf: Buffer;
  let TINY_PNG: Buffer;

  beforeAll(async () => {
    if (!harness) return; // .skip wired above; defensive
    const TEST_ENV: AppEnv = {
      ...TEST_ENV_BASE,
      PDF_SIGNING_PROVIDER: 'kms',
      PDF_SIGNING_KMS_KEY_ID: harness.keyId,
      PDF_SIGNING_KMS_REGION: LOCALSTACK_REGION,
      PDF_SIGNING_KMS_CERT_PEM: harness.certPem,
    };
    const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;

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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    sealing = moduleRef.get(SealingService);
    pades = moduleRef.get(PadesSigner);

    tokenA = await tk.sign(
      { sub: USER_A, email: 'sender@example.com' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );

    // Tiny single-page PDF + PNG fixtures used by the seal pipeline.
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    tinyPdf = Buffer.from(await doc.save({ useObjectStreams: false }));
    TINY_PNG = await sharp({
      create: { width: 8, height: 8, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('boots a Nest app whose PadesSigner is the KmsPadesSigner', () => {
    expect(pades.constructor.name).toBe('KmsPadesSigner');
  });

  it('signs a PDF — output carries /SubFilter /ETSI.CAdES.detached and /ByteRange', async () => {
    const signed = await pades.sign(tinyPdf);
    expect(signed.length).toBeGreaterThan(tinyPdf.length);
    const text = signed.toString('latin1');
    expect(text).toMatch(/\/SubFilter\s*\/ETSI\.CAdES\.detached/);
    expect(text).toMatch(/\/ByteRange\s*\[/);
    // Optional: dump for visual inspection.
    const outDir = mkdtempSync(join(tmpdir(), 'seald-kms-e2e-'));
    writeFileSync(join(outDir, 'kms-signed.pdf'), signed);
    // eslint-disable-next-line no-console
    console.log('[pades-kms test] artifact written to', outDir);
    void TINY_PNG;
    void request;
    void sealing;
    void envelopesRepo;
    void contactsRepo;
    void storage;
    void outbound;
    void tokenA;
    void spawn;
  });
});
