import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { StorageService } from '../src/storage/storage.service';
import { TemplatesRepository } from '../src/templates/templates.repository';
import { InMemoryStorageService } from './in-memory-storage';
import { InMemoryTemplatesRepository } from './in-memory-templates-repository';
import { buildTestJwks } from './test-jwks';

const TEST_ENV: AppEnv = {
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
  PDF_SIGNING_PROVIDER: 'local',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  ENVELOPE_RETENTION_YEARS: 7,
  WORKER_ENABLED: false,
  GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
  GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
};

const ISSUER = `${TEST_ENV.SUPABASE_URL}/auth/v1`;
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const SAMPLE_PAYLOAD = {
  title: 'NDA — short form',
  description: 'Mutual NDA',
  cover_color: '#FFFBEB',
  field_layout: [
    { type: 'signature', pageRule: 'last', x: 60, y: 540 },
    { type: 'date', pageRule: 'last', x: 320, y: 540 },
    { type: 'initial', pageRule: 'all', x: 522, y: 50 },
  ],
};

describe('Templates HTTP (e2e)', () => {
  let app: INestApplication;
  let templates: InMemoryTemplatesRepository;
  let storage: InMemoryStorageService;
  let tk: Awaited<ReturnType<typeof buildTestJwks>>;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    tk = await buildTestJwks();
    templates = new InMemoryTemplatesRepository();
    storage = new InMemoryStorageService();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(TEST_ENV)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(TemplatesRepository)
      .useValue(templates)
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    tokenA = await tk.sign(
      { sub: USER_A, email: 'a@example.com' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );
    tokenB = await tk.sign(
      { sub: USER_B, email: 'b@example.com' },
      { issuer: ISSUER, audience: TEST_ENV.SUPABASE_JWT_AUDIENCE },
    );
  });

  beforeEach(() => {
    templates.reset();
    storage.reset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/templates').expect(401);
  });

  it('CRUD round-trip — create, list, get, update, delete', async () => {
    // Create
    const createRes = await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(SAMPLE_PAYLOAD)
      .expect(201);
    const id = createRes.body.id as string;
    expect(createRes.body).toMatchObject({
      title: 'NDA — short form',
      uses_count: 0,
      last_used_at: null,
    });
    expect(createRes.body.field_layout).toHaveLength(3);

    // List
    const listRes = await request(app.getHttpServer())
      .get('/templates')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe(id);

    // Get
    const getRes = await request(app.getHttpServer())
      .get(`/templates/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(getRes.body.title).toBe('NDA — short form');

    // Update
    const updateRes = await request(app.getHttpServer())
      .patch(`/templates/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ title: 'Renamed NDA' })
      .expect(200);
    expect(updateRes.body.title).toBe('Renamed NDA');

    // Delete
    await request(app.getHttpServer())
      .delete(`/templates/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/templates/${id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  it('scopes by owner — user B cannot see user A templates', async () => {
    const created = await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(SAMPLE_PAYLOAD)
      .expect(201);
    const id = created.body.id as string;

    // User B cannot list it.
    const listB = await request(app.getHttpServer())
      .get('/templates')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(listB.body).toEqual([]);

    // User B cannot read or modify it.
    await request(app.getHttpServer())
      .get(`/templates/${id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/templates/${id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ title: 'attacker' })
      .expect(404);
  });

  it('POST /templates/:id/use bumps uses_count + last_used_at', async () => {
    const created = await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(SAMPLE_PAYLOAD)
      .expect(201);
    const id = created.body.id as string;

    const useRes = await request(app.getHttpServer())
      .post(`/templates/${id}/use`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(useRes.body.uses_count).toBe(1);
    expect(useRes.body.last_used_at).not.toBeNull();
  });

  it('rejects unknown pageRule literals at validation', async () => {
    await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        ...SAMPLE_PAYLOAD,
        field_layout: [{ type: 'signature', pageRule: 'middle', x: 0, y: 0 }],
      })
      .expect(400);
  });

  it('accepts an integer pageRule (1-indexed page number)', async () => {
    const res = await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        ...SAMPLE_PAYLOAD,
        field_layout: [{ type: 'text', pageRule: 3, x: 100, y: 200, label: 'Note' }],
      })
      .expect(201);
    expect(res.body.field_layout[0].pageRule).toBe(3);
  });

  it('rejects 0 or negative pageRule integers', async () => {
    await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        ...SAMPLE_PAYLOAD,
        field_layout: [{ type: 'signature', pageRule: 0, x: 0, y: 0 }],
      })
      .expect(400);
  });

  describe('Example PDF round trip', () => {
    // Minimal valid PDF header — enough for the controller's mime check
    // and the in-memory storage to round-trip the buffer. The seal /
    // verify pipeline isn't exercised here; we only assert the upload
    // path stores the bytes and the download streams them back.
    const PDF_BYTES = Buffer.from('%PDF-1.4\n% test fixture\n%%EOF', 'utf8');

    async function createOwned(): Promise<string> {
      const r = await request(app.getHttpServer())
        .post('/templates')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(SAMPLE_PAYLOAD)
        .expect(201);
      return r.body.id as string;
    }

    it('stores the PDF on POST /templates/:id/example and flips has_example_pdf', async () => {
      const id = await createOwned();
      // Pre-condition: no PDF yet.
      const before = await request(app.getHttpServer())
        .get(`/templates/${id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(before.body.has_example_pdf).toBe(false);

      const uploaded = await request(app.getHttpServer())
        .post(`/templates/${id}/example`)
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', PDF_BYTES, { filename: 'sample.pdf', contentType: 'application/pdf' })
        .expect(200);
      expect(uploaded.body.has_example_pdf).toBe(true);

      // Storage path is server-side; the in-memory adapter records it
      // by template id so we can assert it landed.
      const stored = storage.allPaths().find((p) => p.endsWith(`/${id}/example.pdf`));
      expect(stored).toBeDefined();
      const obj = storage.get(stored!);
      expect(obj?.contentType).toBe('application/pdf');
      expect(obj?.bytes.equals(PDF_BYTES)).toBe(true);
    });

    it('streams the PDF back on GET /templates/:id/example', async () => {
      const id = await createOwned();
      await request(app.getHttpServer())
        .post(`/templates/${id}/example`)
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', PDF_BYTES, { filename: 'sample.pdf', contentType: 'application/pdf' })
        .expect(200);

      const fetched = await request(app.getHttpServer())
        .get(`/templates/${id}/example`)
        .set('Authorization', `Bearer ${tokenA}`)
        .buffer(true)
        .parse((res, cb) => {
          // supertest's default parser is JSON; for a binary body we
          // need to accumulate the raw bytes.
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      expect(fetched.headers['content-type']).toBe('application/pdf');
      expect((fetched.body as Buffer).equals(PDF_BYTES)).toBe(true);
    });

    it('returns 404 when the template has no example PDF attached', async () => {
      const id = await createOwned();
      await request(app.getHttpServer())
        .get(`/templates/${id}/example`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('rejects a non-PDF mime', async () => {
      const id = await createOwned();
      await request(app.getHttpServer())
        .post(`/templates/${id}/example`)
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', Buffer.from('plain text'), {
          filename: 'note.txt',
          contentType: 'text/plain',
        })
        .expect(400);
    });

    it('scopes example PDFs by owner — user B cannot upload to or read user A templates', async () => {
      const id = await createOwned();
      // Upload by attacker → 404 (no leaking ownership).
      await request(app.getHttpServer())
        .post(`/templates/${id}/example`)
        .set('Authorization', `Bearer ${tokenB}`)
        .attach('file', PDF_BYTES, { filename: 'sample.pdf', contentType: 'application/pdf' })
        .expect(404);
      // Owner uploads then attacker tries to download → 404.
      await request(app.getHttpServer())
        .post(`/templates/${id}/example`)
        .set('Authorization', `Bearer ${tokenA}`)
        .attach('file', PDF_BYTES, { filename: 'sample.pdf', contentType: 'application/pdf' })
        .expect(200);
      await request(app.getHttpServer())
        .get(`/templates/${id}/example`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });
});
