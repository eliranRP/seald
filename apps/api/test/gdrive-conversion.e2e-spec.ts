import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { GDRIVE_REPOSITORY } from '../src/integrations/gdrive/gdrive.repository';
import type { GDriveAccount, GDriveRepository } from '../src/integrations/gdrive/gdrive.repository';
import { GOOGLE_OAUTH_CLIENT } from '../src/integrations/gdrive/gdrive.service';
import type { GoogleOAuthClient } from '../src/integrations/gdrive/gdrive.service';
import { GDriveKmsService } from '../src/integrations/gdrive/gdrive-kms.service';
import {
  CONVERSION_ASSET_WRITER,
  DRIVE_FETCHER,
  GOTENBERG_CLIENT,
  type ConversionAssetWriter,
  type DriveFetcher,
  type GotenbergClient,
} from '../src/integrations/gdrive/conversion/conversion.service';
import { FEATURE_FLAGS } from 'shared';
import { buildTestJwks } from './test-jwks';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { TemplatesRepository } from '../src/templates/templates.repository';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { IdempotencyRepository } from '../src/me/idempotency.repository';
import { SupabaseAdminClient } from '../src/me/supabase-admin.client';
import { TombstonesRepository } from '../src/me/tombstones.repository';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryTemplatesRepository } from './in-memory-templates-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryIdempotencyRepository } from './in-memory-idempotency-repository';
import { StubSupabaseAdminClient } from './stub-supabase-admin';

class FakeTombstonesRepository extends TombstonesRepository {
  async recordDeletion(): Promise<void> {
    /* noop */
  }
}

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
  EMAIL_LEGAL_POSTAL: 'addr',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com',
  PDF_SIGNING_PROVIDER: 'local',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  ENVELOPE_RETENTION_YEARS: 7,
  WORKER_ENABLED: false,
  GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
  GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
};

const USER_A = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

class InMemoryGDriveRepo implements GDriveRepository {
  rows = new Map<string, GDriveAccount>();
  async findByIdForUser(id: string, userId: string): Promise<GDriveAccount | null> {
    const r = this.rows.get(id);
    return r && r.userId === userId ? r : null;
  }
  async listForUser(userId: string): Promise<ReadonlyArray<GDriveAccount>> {
    return [...this.rows.values()].filter((r) => r.userId === userId && !r.deletedAt);
  }
  async insert(row: GDriveAccount): Promise<GDriveAccount> {
    this.rows.set(row.id, row);
    return row;
  }
  async findActiveByUserAndGoogleUser(
    userId: string,
    googleUserId: string,
  ): Promise<GDriveAccount | null> {
    return (
      [...this.rows.values()].find(
        (r) => r.userId === userId && r.googleUserId === googleUserId && !r.deletedAt,
      ) ?? null
    );
  }
  async replaceToken(args: {
    id: string;
    refreshTokenCiphertext: Buffer;
    refreshTokenKmsKeyArn: string;
    scope: string;
    googleEmail: string;
  }): Promise<GDriveAccount> {
    const r = this.rows.get(args.id);
    if (!r) throw new Error('replaceToken: row not found');
    const next: GDriveAccount = {
      ...r,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      refreshTokenKmsKeyArn: args.refreshTokenKmsKeyArn,
      scope: args.scope,
      googleEmail: args.googleEmail,
      lastUsedAt: null,
    };
    this.rows.set(args.id, next);
    return next;
  }
  async softDelete(id: string, userId: string): Promise<boolean> {
    const r = this.rows.get(id);
    if (!r || r.userId !== userId) return false;
    this.rows.set(id, { ...r, deletedAt: new Date().toISOString() });
    return true;
  }
  async touchLastUsed(): Promise<void> {
    /* noop */
  }
}

class StubGoogleClient implements GoogleOAuthClient {
  async exchangeCode(): Promise<{
    refreshToken: string;
    accessToken: string;
    expiresAt: number;
    googleUserId: string;
    googleEmail: string;
    scope: string;
  }> {
    return {
      refreshToken: 'rt',
      accessToken: 'at',
      expiresAt: Date.now() + 3600_000,
      googleUserId: 'g-1',
      googleEmail: 'u@example.com',
      scope: 'https://www.googleapis.com/auth/drive.file',
    };
  }
  async refreshAccessToken(): Promise<{ accessToken: string; expiresAt: number }> {
    return { accessToken: 'at-fresh', expiresAt: Date.now() + 3600_000 };
  }
  async revokeToken(): Promise<void> {
    /* noop */
  }
}

class StubKmsService extends GDriveKmsService {
  constructor() {
    super(
      {
        async generateDataKey(): Promise<{ plaintext: Buffer; ciphertextBlob: Buffer }> {
          const k = Buffer.alloc(32, 7);
          return { plaintext: k, ciphertextBlob: Buffer.concat([Buffer.from('K|'), k]) };
        },
        async decrypt(blob: Buffer): Promise<Buffer> {
          return blob.subarray(blob.indexOf(0x7c) + 1);
        },
      },
      'arn:aws:kms:us-east-1:000000000000:key/k',
    );
  }
  // Bypass the real envelope decrypt — the seeded refresh-token ciphertext
  // in this suite is a sentinel ("K|<32 bytes>"), not a real GCM envelope.
  override async decrypt(): Promise<string> {
    return 'rt-fake';
  }
  override async encrypt(): Promise<{ ciphertext: Buffer; kmsKeyArn: string }> {
    return {
      ciphertext: Buffer.from('K|' + 'k'.repeat(32)),
      kmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/k',
    };
  }
}

describe('Drive doc → PDF conversion (WT-D) — e2e', () => {
  let app: INestApplication;
  let driveCalls: Array<{ url: string; signal?: AbortSignal }>;
  let gotenbergCalls: Array<{ filename: string; signal?: AbortSignal }>;
  let driveResponder: () => {
    ok: boolean;
    status: number;
    body: Buffer;
    contentLength: number;
  };
  let gotenbergResponder: () => Promise<{ ok: boolean; status: number; body: Buffer }>;
  let assetWriterUrl: string;
  let repo: InMemoryGDriveRepo;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let tokenA: string;

  beforeAll(async () => {
    tk = await buildTestJwks();
    repo = new InMemoryGDriveRepo();

    const driveFetcher: DriveFetcher = async ({ url, signal }) => {
      driveCalls.push({ url, ...(signal !== undefined ? { signal } : {}) });
      return driveResponder();
    };
    const gotenbergClient: GotenbergClient = async ({ filename, signal }) => {
      gotenbergCalls.push({ filename, ...(signal !== undefined ? { signal } : {}) });
      return gotenbergResponder();
    };
    const assetWriter: ConversionAssetWriter = async () => ({ url: assetWriterUrl });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(GDRIVE_REPOSITORY)
      .useValue(repo)
      .overrideProvider(GOOGLE_OAUTH_CLIENT)
      .useValue(new StubGoogleClient())
      .overrideProvider(GDriveKmsService)
      .useValue(new StubKmsService())
      .overrideProvider(DRIVE_FETCHER)
      .useValue(driveFetcher)
      .overrideProvider(GOTENBERG_CLIENT)
      .useValue(gotenbergClient)
      .overrideProvider(CONVERSION_ASSET_WRITER)
      .useValue(assetWriter)
      // Other in-memory repos so AppModule can boot without a DB.
      .overrideProvider(ContactsRepository)
      .useValue(new InMemoryContactsRepository())
      .overrideProvider(EnvelopesRepository)
      .useValue(new InMemoryEnvelopesRepository())
      .overrideProvider(TemplatesRepository)
      .useValue(new InMemoryTemplatesRepository())
      .overrideProvider(OutboundEmailsRepository)
      .useValue(new InMemoryOutboundEmailsRepository())
      .overrideProvider(IdempotencyRepository)
      .useValue(new InMemoryIdempotencyRepository())
      .overrideProvider(SupabaseAdminClient)
      .useValue(new StubSupabaseAdminClient())
      .overrideProvider(TombstonesRepository)
      .useValue(new FakeTombstonesRepository())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    tokenA = await tk.sign(
      { sub: USER_A, email: 'a@example.com' },
      {
        issuer: `${TEST_ENV.SUPABASE_URL}/auth/v1`,
        audience: TEST_ENV.SUPABASE_JWT_AUDIENCE,
      },
    );
  });

  beforeEach(() => {
    driveCalls = [];
    gotenbergCalls = [];
    driveResponder = (): {
      ok: boolean;
      status: number;
      body: Buffer;
      contentLength: number;
    } => {
      const body = Buffer.from('PK\x03\x04docx-bytes');
      return { ok: true, status: 200, body, contentLength: body.length };
    };
    gotenbergResponder = async (): Promise<{ ok: boolean; status: number; body: Buffer }> => {
      const body = Buffer.from('%PDF-1.7 fake');
      return { ok: true, status: 200, body };
    };
    assetWriterUrl = 'https://signed.example.com/converted.pdf';
    (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = true;

    // Seed an account owned by USER_A.
    repo.rows.clear();
    repo.rows.set(ACCOUNT_ID, {
      id: ACCOUNT_ID,
      userId: USER_A,
      googleUserId: 'g-1',
      googleEmail: 'u@example.com',
      refreshTokenCiphertext: Buffer.from('K|' + 'k'.repeat(32)),
      refreshTokenKmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/k',
      scope: 'https://www.googleapis.com/auth/drive.file',
      connectedAt: new Date().toISOString(),
      lastUsedAt: null,
      deletedAt: null,
    });
  });

  afterAll(async () => {
    (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = false;
    await app.close();
  });

  const auth = (t: string): { Authorization: string } => ({ Authorization: `Bearer ${t}` });

  it('happy path: POST → poll → done; asset URL returned', async () => {
    const startRes = await request(app.getHttpServer())
      .post('/integrations/gdrive/conversion')
      .set(auth(tokenA))
      .send({
        accountId: ACCOUNT_ID,
        fileId: 'docx-1',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    expect(startRes.status).toBe(201);
    expect(startRes.body.jobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(startRes.body.status).toBe('pending');

    // Poll until terminal.
    const jobId = startRes.body.jobId;
    let pollRes: import('supertest').Response | undefined;
    for (let i = 0; i < 20; i++) {
      pollRes = await request(app.getHttpServer())
        .get(`/integrations/gdrive/conversion/${jobId}`)
        .set(auth(tokenA));
      if (pollRes.body.status === 'done' || pollRes.body.status === 'failed') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(pollRes?.status).toBe(200);
    expect(pollRes?.body).toEqual({
      jobId,
      status: 'done',
      assetUrl: 'https://signed.example.com/converted.pdf',
    });
    expect(driveCalls).toHaveLength(1);
    expect(gotenbergCalls).toHaveLength(1);
  });

  it('cancel within 100ms: DELETE aborts; next GET returns cancelled', async () => {
    // Make Gotenberg slow so cancel beats it.
    gotenbergResponder = async (): Promise<{ ok: boolean; status: number; body: Buffer }> => {
      await new Promise((r) => setTimeout(r, 200));
      return { ok: true, status: 200, body: Buffer.from('%PDF') };
    };
    const startRes = await request(app.getHttpServer())
      .post('/integrations/gdrive/conversion')
      .set(auth(tokenA))
      .send({
        accountId: ACCOUNT_ID,
        fileId: 'docx-2',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    const jobId = startRes.body.jobId;
    // Cancel quickly.
    const delRes = await request(app.getHttpServer())
      .delete(`/integrations/gdrive/conversion/${jobId}`)
      .set(auth(tokenA));
    expect(delRes.status).toBe(204);
    // Give the in-flight job a tick to observe the abort.
    await new Promise((r) => setTimeout(r, 10));
    const pollRes = await request(app.getHttpServer())
      .get(`/integrations/gdrive/conversion/${jobId}`)
      .set(auth(tokenA));
    expect(pollRes.status).toBe(200);
    expect(pollRes.body.status).toBe('cancelled');
  });

  it('Gotenberg 5xx → status failed with code conversion-failed', async () => {
    gotenbergResponder = async (): Promise<{ ok: boolean; status: number; body: Buffer }> => ({
      ok: false,
      status: 503,
      body: Buffer.from('libreoffice fell over'),
    });
    const startRes = await request(app.getHttpServer())
      .post('/integrations/gdrive/conversion')
      .set(auth(tokenA))
      .send({
        accountId: ACCOUNT_ID,
        fileId: 'docx-3',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    expect(startRes.status).toBe(201);
    const jobId = startRes.body.jobId;
    let pollRes: import('supertest').Response | undefined;
    for (let i = 0; i < 20; i++) {
      pollRes = await request(app.getHttpServer())
        .get(`/integrations/gdrive/conversion/${jobId}`)
        .set(auth(tokenA));
      if (pollRes.body.status === 'failed' || pollRes.body.status === 'done') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(pollRes?.body.status).toBe('failed');
    expect(pollRes?.body.errorCode).toBe('conversion-failed');
    // Defence in depth: response body must NOT echo upstream message.
    expect(JSON.stringify(pollRes?.body)).not.toContain('libreoffice');
  });

  it('feature flag off → 404 on every conversion route', async () => {
    (FEATURE_FLAGS as Record<string, boolean>).gdriveIntegration = false;
    const post = await request(app.getHttpServer())
      .post('/integrations/gdrive/conversion')
      .set(auth(tokenA))
      .send({ accountId: ACCOUNT_ID, fileId: 'x', mimeType: 'application/pdf' });
    expect(post.status).toBe(404);
    // Use a valid UUID format (ParseUUIDPipe rejects non-UUIDs with 422)
    const fakeUuid = '00000000-0000-4000-8000-000000000000';
    const get = await request(app.getHttpServer())
      .get(`/integrations/gdrive/conversion/${fakeUuid}`)
      .set(auth(tokenA));
    expect(get.status).toBe(404);
    const del = await request(app.getHttpServer())
      .delete(`/integrations/gdrive/conversion/${fakeUuid}`)
      .set(auth(tokenA));
    expect(del.status).toBe(404);
  });

  it('rejects unsupported-mime with 400 + error code', async () => {
    const res = await request(app.getHttpServer())
      .post('/integrations/gdrive/conversion')
      .set(auth(tokenA))
      .send({ accountId: ACCOUNT_ID, fileId: 'x', mimeType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unsupported-mime');
  });

  it('rejects oversize via Drive content-length with file-too-large', async () => {
    driveResponder = (): {
      ok: boolean;
      status: number;
      body: Buffer;
      contentLength: number;
    } => ({
      ok: true,
      status: 200,
      body: Buffer.alloc(0),
      contentLength: TEST_ENV.GDRIVE_CONVERSION_MAX_BYTES + 1,
    });
    const startRes = await request(app.getHttpServer())
      .post('/integrations/gdrive/conversion')
      .set(auth(tokenA))
      .send({ accountId: ACCOUNT_ID, fileId: 'huge', mimeType: 'application/pdf' });
    const jobId = startRes.body.jobId;
    let pollRes: import('supertest').Response | undefined;
    for (let i = 0; i < 20; i++) {
      pollRes = await request(app.getHttpServer())
        .get(`/integrations/gdrive/conversion/${jobId}`)
        .set(auth(tokenA));
      if (pollRes.body.status === 'failed' || pollRes.body.status === 'done') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(pollRes?.body.status).toBe('failed');
    expect(pollRes?.body.errorCode).toBe('file-too-large');
  });
});
