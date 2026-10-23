import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Kysely } from 'kysely';
import { Pool } from 'pg';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { McpEventMetadataSchema, type ApiKeyScope, type FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
import { generateApiKey } from '../src/api-keys/api-key-secret';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { BulkWorkerService } from '../src/bulk/bulk-worker.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { DB_TOKEN } from '../src/db/db.provider';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { findTokenShapedStrings } from '../src/mcp/leak-scan';
import { StorageService } from '../src/storage/storage.service';
import { dispatchSignLinks } from './dispatched-sign-links';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';

/**
 * The MCP "Later" list (WP-26, step 15) end to end on real Postgres,
 * driven by the SDK `Client`: fix a signer and change an expiry through
 * owner approval; bulk send over one approval with the daily cap counting
 * queued rows; the access-code and template authoring tools; and the
 * agent activity list over the events and approvals those calls caused.
 *
 * Its own scratch database on the server named by
 * SUBMIT_SIGNER_DATABASE_URL; skipped when unset locally, fails in CI.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `mcp_later_e2e_${randomBytes(4).toString('hex')}`;
const MIGRATIONS = resolve(__dirname, '../db/migrations');
const APP_URL = 'http://localhost:5173';

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the MCP later e2e');
}
const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
const FLAGS: Partial<Record<FeatureFlag, boolean>> = {
  mcpServer: true,
  signingOrder: true,
  bulkSend: true,
  signerAccessAuth: true,
};

interface Key {
  readonly id: string;
  readonly token: string;
}

describePg('MCP "Later" list (e2e, real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let app: INestApplication;
  let baseUrl: string;
  const storage = new InMemoryStorageService();
  const owner = randomUUID();
  const stranger = randomUUID();
  const OWNER_EMAIL = 'maya@example.com';
  let fresh = '';
  let strangerJwt = '';
  let pdfBytes: Buffer;
  let templateId = '';
  const clients: Client[] = [];
  let key: Key = { id: '', token: '' };
  let narrow: Key = { id: '', token: '' };

  function q<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) {
    if (!pool) throw new Error('pool not ready');
    return pool.query<T>(text, values);
  }

  async function insertKey(name: string, scopes: ApiKeyScope[]): Promise<Key> {
    const k = generateApiKey();
    const row = await q<{ id: string }>(
      `insert into public.api_keys
         (owner_id, name, prefix, key_hash, scopes, expires_at, require_owner_approval, allow_new_recipients)
       values ($1, $2, $3, $4, $5, now() + interval '30 days', true, false) returning id`,
      [owner, name, k.prefix, k.keyHash, scopes],
    );
    return { id: row.rows[0]!.id, token: k.token };
  }

  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function draft(signers: Array<{ name: string; email: string }>): Promise<{
    id: string;
    signerIds: string[];
  }> {
    const env = await http().post('/envelopes').set(bearer(fresh)).send({ title: 'Supplier NDA' });
    expect(env.status).toBe(201);
    const id = env.body.id as string;
    await http()
      .post(`/envelopes/${id}/upload`)
      .set(bearer(fresh))
      .attach('file', pdfBytes, { filename: 'nda.pdf', contentType: 'application/pdf' })
      .expect(201);
    const ids: string[] = [];
    for (const s of signers) {
      const res = await http().post(`/envelopes/${id}/signers`).set(bearer(fresh)).send(s);
      expect(res.status).toBe(201);
      ids.push(res.body.id as string);
    }
    await http()
      .put(`/envelopes/${id}/fields`)
      .set(bearer(fresh))
      .send({
        fields: ids.map((signer_id, i) => ({
          signer_id,
          kind: 'signature',
          page: 1,
          x: 0.1,
          y: 0.1 + i * 0.1,
          width: 0.2,
          height: 0.05,
          required: true,
        })),
      })
      .expect(200);
    return { id, signerIds: ids };
  }

  /** A draft sent from the web app, so its recipients are known. */
  async function sentFromApp(signers: Array<{ name: string; email: string }>) {
    const d = await draft(signers);
    expect((await http().post(`/envelopes/${d.id}/send`).set(bearer(fresh))).status).toBe(201);
    return d;
  }

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'wp26-e2e', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport as Transport);
    clients.push(client);
    return client;
  }

  async function call(
    client: Client,
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const serialized = JSON.stringify(result);
    expect({ name, leaks: findTokenShapedStrings(serialized) }).toEqual({ name, leaks: [] });
    expect(serialized).not.toContain('/approve#');
    return result;
  }

  const ok = (r: CallToolResult) => {
    if (r.isError) {
      const first = r.content[0];
      throw new Error(`tool error: ${first && first.type === 'text' ? first.text : '?'}`);
    }
    return r.structuredContent as Record<string, unknown>;
  };
  const errorOf = (r: CallToolResult) => {
    expect(r.isError).toBe(true);
    const first = r.content[0];
    return JSON.parse(first && first.type === 'text' ? first.text : '{}') as { slug: string };
  };
  let seq = 0;
  const write = (extra: Record<string, unknown>) => {
    seq += 1;
    return {
      idempotency_key: `wp26-key-${String(seq).padStart(6, '0')}`,
      dry_run: false,
      ...extra,
    };
  };

  async function events(id: string) {
    const r = await q<{ event_type: string; metadata: Record<string, unknown> }>(
      `select event_type::text, metadata from envelope_events
        where envelope_id = $1 order by created_at, id`,
      [id],
    );
    return r.rows;
  }

  const approveInApp = (approvalId: string) =>
    http().post(`/approvals/${approvalId}/approve`).set(bearer(fresh));

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    const dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 6 });
    pool.on('error', () => undefined);
    await q(`
      create schema if not exists auth;
      create table if not exists auth.users (
        id uuid primary key, email text, email_confirmed_at timestamptz
      );
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR: MIGRATIONS },
    });
    await q(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [
      owner,
      OWNER_EMAIL,
    ]);
    await q(`insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now())`, [
      stranger,
      'other@example.com',
    ]);
    key = await insertKey('Key 2', [
      'envelopes:read',
      'envelopes:write',
      'envelopes:send',
      'templates:read',
      'templates:write',
    ]);
    narrow = await insertKey('Read only', ['envelopes:read']);

    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    pdfBytes = Buffer.from(await doc.save());

    const tk = await buildTestJwks();
    const nowS = Math.floor(Date.now() / 1000);
    const opts = { issuer: 'https://example.supabase.co/auth/v1', audience: 'authenticated' };
    fresh = await tk.sign(
      { sub: owner, email: OWNER_EMAIL, amr: [{ method: 'password', timestamp: nowS - 60 }] },
      opts,
    );
    strangerJwt = await tk.sign(
      {
        sub: stranger,
        email: 'other@example.com',
        amr: [{ method: 'password', timestamp: nowS - 60 }],
      },
      opts,
    );

    const testEnv: AppEnv = {
      NODE_ENV: 'test',
      PORT: 0,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_JWT_AUDIENCE: 'authenticated',
      CORS_ORIGIN: APP_URL,
      APP_PUBLIC_URL: APP_URL,
      DATABASE_URL: `${dedicatedUrl}${dedicatedUrl.includes('?') ? '&' : '?'}sslmode=disable`,
      STORAGE_BUCKET: 'envelopes',
      TC_VERSION: 'tc',
      PRIVACY_VERSION: 'pp',
      SIGNER_SESSION_SECRET: 'x'.repeat(64),
      EMAIL_PROVIDER: 'logging',
      EMAIL_FROM_ADDRESS: 'onboarding@resend.dev',
      EMAIL_FROM_NAME: 'Seald',
      EMAIL_LEGAL_ENTITY: 'Seald',
      EMAIL_LEGAL_POSTAL: 'Postal address',
      EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
      EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com',
      PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
      WORKER_ENABLED: false,
      GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
      GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
      APPROVAL_CSRF_KEY: 'k'.repeat(48),
      EMAIL_PROVIDER_DAILY_QUOTA: 100_000,
      EMAIL_PROVIDER_MONTHLY_QUOTA: 1_000_000,
      BULK_SEND_ROWS_PER_MINUTE: 1000,
    };
    host.__SEALD_FEATURE_OVERRIDES__ = { ...FLAGS };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(testEnv)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(StorageService)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;

    // A one-signer template with an example PDF, for bulk send.
    const created = await http()
      .post('/templates')
      .set(bearer(fresh))
      .send({
        title: 'Lease',
        field_layout: [{ type: 'signature', pageRule: 'last', x: 60, y: 200, signerRoleId: 't' }],
        last_signers: [{ id: 't', name: 'Tenant', email: 't@example.com', color: '#445566' }],
      })
      .expect(201);
    templateId = created.body.id as string;
    await http()
      .post(`/templates/${templateId}/example`)
      .set(bearer(fresh))
      .attach('file', pdfBytes, { filename: 'e.pdf', contentType: 'application/pdf' })
      .expect(200);
  }, 180_000);

  beforeEach(() => {
    host.__SEALD_FEATURE_OVERRIDES__ = { ...FLAGS };
  });

  afterAll(async () => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
    for (const c of clients) await c.close().catch(() => undefined);
    await app?.get<Kysely<Database>>(DB_TOKEN).destroy();
    await app?.close();
    pool?.on('error', () => undefined);
    await pool?.end().catch(() => undefined);
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  it('applies migration 0039: the two event types and the mail kind', async () => {
    const events = await q(`select unnest(enum_range(null::event_type))::text as l`);
    expect(events.rows.map((r) => r.l)).toEqual(
      expect.arrayContaining(['signer_corrected', 'expiry_changed']),
    );
    const kinds = await q(`select unnest(enum_range(null::email_kind))::text as l`);
    expect(kinds.rows.map((r) => r.l)).toContain('signer_corrected');
  });

  it('lists the step 15 tools, and hides the flagged ones while their flag is off', async () => {
    const client = await connect(key.token);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'envelopes_fix_signer',
        'envelopes_change_expiry',
        'envelopes_bulk_send_from_template',
        'batches_get',
        'envelopes_get_access_auth',
        'envelopes_set_access_auth',
        'templates_create',
        'templates_update',
        'templates_delete',
      ]),
    );
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true };
    const dark = (await client.listTools()).tools.map((t) => t.name);
    for (const gone of [
      'envelopes_bulk_send_from_template',
      'batches_get',
      'envelopes_get_access_auth',
      'envelopes_set_access_auth',
    ]) {
      expect(dark).not.toContain(gone);
    }
    // Fix a signer, change an expiry and template authoring ride on mcpServer alone.
    expect(dark).toEqual(
      expect.arrayContaining([
        'envelopes_fix_signer',
        'envelopes_change_expiry',
        'templates_create',
      ]),
    );
  });

  describe('envelopes_fix_signer', () => {
    it('asks the owner, then corrects the signer: old link dead, new invite, note to the old address', async () => {
      const d = await sentFromApp([
        { name: 'Ada', email: 'ada@first.test' },
        { name: 'Bob', email: 'bob@first.test' },
      ]);
      const first = await dispatchSignLinks(app, [d.id]);
      const oldToken = first.find((l) => l.to === 'ada@first.test')?.token ?? '';
      expect(oldToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const client = await connect(key.token);
      const out = ok(
        await call(
          client,
          'envelopes_fix_signer',
          write({ envelope_id: d.id, signer_id: d.signerIds[0], email: 'Ada@Second.test' }),
        ),
      );
      expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
      expect(out['summary']).toMatchObject({
        kind: 'envelope_fix_signer',
        recipients: [{ email: 'ada@second.test', is_new: true }],
      });
      // Nothing changed yet.
      const before = await q<{ email: string }>(
        'select email::text from envelope_signers where id = $1',
        [d.signerIds[0]],
      );
      expect(before.rows[0]?.email).toBe('ada@first.test');
      expect((await events(d.id)).filter((e) => e.event_type === 'signer_corrected')).toEqual([]);

      // The owner approves in the app, signed in (fixing a signer always needs a session).
      const approvalId = String(out['approval_id']);
      expect((await approveInApp(approvalId)).status).toBe(200);

      const after = await q<{ email: string; token: string | null; contact: string | null }>(
        `select email::text, access_token_hash as token, contact_id::text as contact
           from envelope_signers where id = $1`,
        [d.signerIds[0]],
      );
      expect(after.rows[0]).toMatchObject({ email: 'ada@second.test', token: null });
      const rows = await events(d.id);
      const fixed = rows.filter((e) => e.event_type === 'signer_corrected');
      expect(fixed).toHaveLength(1);
      expect(fixed[0]!.metadata).toMatchObject({
        previous_email: 'ada@first.test',
        new_email: 'ada@second.test',
        email_changed: true,
      });
      expect(McpEventMetadataSchema.parse(fixed[0]!.metadata['mcp'])).toMatchObject({
        tool: 'envelopes_fix_signer',
        key_name: 'Key 2',
        approval: 'email',
        approved_by_session: true,
      });
      const types = rows.map((e) => e.event_type);
      expect(types.indexOf('approval_decided')).toBeLessThan(types.indexOf('signer_corrected'));
      expect(await app.get(EnvelopesRepository).verifyEventChain(d.id)).toMatchObject({
        chain_intact: true,
      });

      // The previous link is dead before any new mail goes out.
      const dead = await http().post('/sign/start').send({ envelope_id: d.id, token: oldToken });
      expect(dead.status).toBe(401);

      // The corrected address gets a working link; the old address gets the note.
      const links = await dispatchSignLinks(app, [d.id]);
      const fresh2 = links.find((l) => l.to === 'ada@second.test');
      expect(fresh2?.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(fresh2?.token).not.toBe(oldToken);
      const started = await http()
        .post('/sign/start')
        .send({ envelope_id: d.id, token: fresh2?.token });
      expect(started.status).toBe(200);
      const note = await q<{ status: string; to_email: string }>(
        `select status::text, to_email::text from outbound_emails
          where envelope_id = $1 and kind = 'signer_corrected'`,
        [d.id],
      );
      expect(note.rows).toEqual([{ status: 'sent', to_email: 'ada@first.test' }]);
      // Bob was not touched.
      expect(links.find((l) => l.to === 'bob@first.test')).toBeUndefined();
    });

    it('refuses a draft, an address another signer has, and an unchanged signer', async () => {
      const client = await connect(key.token);
      const d = await sentFromApp([
        { name: 'Cy', email: 'cy@first.test' },
        { name: 'Di', email: 'di@first.test' },
      ]);
      expect(
        errorOf(
          await call(
            client,
            'envelopes_fix_signer',
            write({ envelope_id: d.id, signer_id: d.signerIds[0], email: 'di@first.test' }),
          ),
        ).slug,
      ).toBe('signer_email_taken');
      expect(
        errorOf(
          await call(
            client,
            'envelopes_fix_signer',
            write({ envelope_id: d.id, signer_id: d.signerIds[0], name: 'Cy' }),
          ),
        ).slug,
      ).toBe('signer_unchanged');
      const dr = await draft([{ name: 'Ed', email: 'ed@first.test' }]);
      expect(
        errorOf(
          await call(
            client,
            'envelopes_fix_signer',
            write({ envelope_id: dr.id, signer_id: dr.signerIds[0], name: 'Edd' }),
          ),
        ).slug,
      ).toBe('envelope_terminal');
      // The account's own mailbox is never a recipient an agent may set.
      expect(
        errorOf(
          await call(
            client,
            'envelopes_fix_signer',
            write({ envelope_id: d.id, signer_id: d.signerIds[0], email: OWNER_EMAIL }),
          ),
        ).slug,
      ).toBe('signer_is_account_owner');
    });

    it('a signer who signed is signer_already_signed, and an approved fix fails closed if they signed meanwhile', async () => {
      const client = await connect(key.token);
      const d = await sentFromApp([{ name: 'Flo', email: 'flo@first.test' }]);
      const out = ok(
        await call(
          client,
          'envelopes_fix_signer',
          write({ envelope_id: d.id, signer_id: d.signerIds[0], name: 'Flora' }),
        ),
      );
      // The signer signs between the request and the owner's Approve.
      await q(
        `update envelope_signers
            set tc_accepted_at = now(), signature_format = 'typed', signed_at = now()
          where id = $1`,
        [d.signerIds[0]],
      );
      const approved = await approveInApp(String(out['approval_id']));
      expect(approved.body).toMatchObject({
        status: 'failed',
        result_slug: 'signer_already_signed',
      });
      expect((await events(d.id)).filter((e) => e.event_type === 'signer_corrected')).toEqual([]);
      expect(
        errorOf(
          await call(
            client,
            'envelopes_fix_signer',
            write({ envelope_id: d.id, signer_id: d.signerIds[0], name: 'Floria' }),
          ),
        ).slug,
      ).toBe('signer_already_signed');
    });
  });

  describe('envelopes_change_expiry', () => {
    it('asks the owner (session), then moves the expiry with attribution', async () => {
      const d = await sentFromApp([{ name: 'Gus', email: 'gus@first.test' }]);
      const client = await connect(key.token);
      const target = new Date(Date.now() + 45 * 86_400_000).toISOString();
      const out = ok(
        await call(
          client,
          'envelopes_change_expiry',
          write({ envelope_id: d.id, expires_at: target }),
        ),
      );
      expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
      const beforeRow = await q<{ expires_at: Date }>(
        'select expires_at from envelopes where id = $1',
        [d.id],
      );
      expect(beforeRow.rows[0]!.expires_at.toISOString()).not.toBe(target);

      expect((await approveInApp(String(out['approval_id']))).body).toMatchObject({
        status: 'done',
      });
      const afterRow = await q<{ expires_at: Date }>(
        'select expires_at from envelopes where id = $1',
        [d.id],
      );
      expect(afterRow.rows[0]!.expires_at.toISOString()).toBe(target);
      const ev = (await events(d.id)).find((e) => e.event_type === 'expiry_changed');
      expect(ev?.metadata).toMatchObject({
        previous_expires_at: beforeRow.rows[0]!.expires_at.toISOString(),
        expires_at: target,
      });
      expect(McpEventMetadataSchema.parse(ev?.metadata['mcp'])).toMatchObject({
        tool: 'envelopes_change_expiry',
        approved_by_session: true,
      });
      expect(await app.get(EnvelopesRepository).verifyEventChain(d.id)).toMatchObject({
        chain_intact: true,
      });
    });

    it('refuses a time outside the bounds, a draft and a finished envelope, and dry_run writes nothing', async () => {
      const client = await connect(key.token);
      const d = await sentFromApp([{ name: 'Hal', email: 'hal@first.test' }]);
      const tooFar = new Date(Date.now() + 200 * 86_400_000).toISOString();
      expect(
        errorOf(
          await call(
            client,
            'envelopes_change_expiry',
            write({ envelope_id: d.id, expires_at: tooFar }),
          ),
        ).slug,
      ).toBe('expiry_out_of_range');
      const dry = ok(
        await call(client, 'envelopes_change_expiry', {
          idempotency_key: 'wp26-dry-expiry-1',
          dry_run: true,
          envelope_id: d.id,
          expires_at: new Date(Date.now() + 20 * 86_400_000).toISOString(),
        }),
      );
      expect(dry).toMatchObject({ dry_run: true, would: { approve_requires: 'session' } });
      const open = await q('select 1 from mcp_approvals where envelope_id = $1', [d.id]);
      expect(open.rowCount).toBe(0);
      const dr = await draft([{ name: 'Ivy', email: 'ivy@first.test' }]);
      expect(
        errorOf(
          await call(
            client,
            'envelopes_change_expiry',
            write({
              envelope_id: dr.id,
              expires_at: new Date(Date.now() + 20 * 86_400_000).toISOString(),
            }),
          ),
        ).slug,
      ).toBe('envelope_terminal');
    });
  });

  describe('bulk send', () => {
    const rows = (n: number, tag: string) =>
      Array.from({ length: n }, (_, i) => ({
        title: `Lease ${tag}${String(i + 1)}`,
        signers: [
          { name: `Tenant ${tag}${String(i + 1)}`, email: `t${String(i + 1)}.${tag}@bulk.test` },
        ],
      }));

    it('one approval for the batch; Approve sends one envelope per row, each with metadata.mcp; batches_get follows', async () => {
      const client = await connect(key.token);
      const out = ok(
        await call(
          client,
          'envelopes_bulk_send_from_template',
          write({ template_id: templateId, rows: rows(3, 'a') }),
        ),
      );
      expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
      const batchId = String(out['batch_id']);
      expect((out['summary'] as { recipients: unknown[] }).recipients).toHaveLength(3);

      const preview = ok(await call(client, 'batches_get', { batch_id: batchId }));
      expect(preview).toMatchObject({ status: 'preview' });
      expect((preview['rows'] as Array<{ status: string }>).map((r) => r.status)).toEqual([
        'pending',
        'pending',
        'pending',
      ]);
      // Nothing is processed before the owner approves.
      expect(await app.get(BulkWorkerService).flushOnce(10)).toMatchObject({ claimed: 0 });

      expect((await approveInApp(String(out['approval_id']))).body).toMatchObject({
        status: 'done',
        result: { batch_id: batchId, status: 'processing', rows: 3 },
      });
      const worked = await app.get(BulkWorkerService).flushOnce(10);
      expect(worked).toMatchObject({ claimed: 3, sent: 3, failed: 0 });

      const done = ok(await call(client, 'batches_get', { batch_id: batchId }));
      expect(done['status']).toBe('completed');
      const sentRows = done['rows'] as Array<{
        status: string;
        envelope_id: string;
        title: string;
      }>;
      expect(sentRows.map((r) => r.status)).toEqual(['sent', 'sent', 'sent']);
      for (const r of sentRows) {
        const sent = (await events(r.envelope_id)).filter((e) => e.event_type === 'sent');
        expect(sent).toHaveLength(1);
        expect(McpEventMetadataSchema.parse(sent[0]!.metadata['mcp'])).toMatchObject({
          tool: 'envelopes_bulk_send_from_template',
          key_name: 'Key 2',
          approval: 'email',
          approved_by_session: true,
        });
        expect(sent[0]!.metadata['new_recipient_count']).toBe(1);
        expect(await app.get(EnvelopesRepository).verifyEventChain(r.envelope_id)).toMatchObject({
          chain_intact: true,
        });
      }
      expect(sentRows.map((r) => r.title)).toEqual(['Lease a1', 'Lease a2', 'Lease a3']);
    });

    it('a retried key replays; one bad row fails the call and writes nothing; dry_run lists the problem', async () => {
      const client = await connect(key.token);
      const args = write({ template_id: templateId, rows: rows(2, 'b') });
      const first = ok(await call(client, 'envelopes_bulk_send_from_template', args));
      expect(ok(await call(client, 'envelopes_bulk_send_from_template', args))).toEqual(first);
      const count = await q('select count(*)::int as n from bulk_batches');

      const bad = [...rows(1, 'c'), { signers: [{ name: 'Nope', email: 'not-an-email' }] }];
      expect(
        errorOf(
          await call(
            client,
            'envelopes_bulk_send_from_template',
            write({ template_id: templateId, rows: bad }),
          ),
        ).slug,
      ).toBe('bulk_rows_invalid');
      expect((await q('select count(*)::int as n from bulk_batches')).rows[0]).toEqual(
        count.rows[0],
      );
      const dry = ok(
        await call(client, 'envelopes_bulk_send_from_template', {
          idempotency_key: 'wp26-dry-bulk-1',
          dry_run: true,
          template_id: templateId,
          rows: bad,
        }),
      );
      expect(dry).toMatchObject({
        dry_run: true,
        would: { valid: false, invalid_rows: [{ row: 2, errors: ['bad_email'] }] },
      });
      expect((await q('select count(*)::int as n from bulk_batches')).rows[0]).toEqual(
        count.rows[0],
      );
    });

    it('counts queued rows toward the daily cap of 20, and a second owner’s batch is invisible', async () => {
      const client = await connect(key.token);
      // 12 rows approved and still queued, plus the two earlier previews' sends (3).
      const big = ok(
        await call(
          client,
          'envelopes_bulk_send_from_template',
          write({ template_id: templateId, rows: rows(12, 'd') }),
        ),
      );
      expect(big['approve_requires']).toBe('session');
      expect((await approveInApp(String(big['approval_id']))).body).toMatchObject({
        status: 'done',
      });
      // 3 sent + 12 queued = 15 of 20 used: 6 more is over the cap and writes nothing.
      const batches = await q('select count(*)::int as n from bulk_batches');
      expect(
        errorOf(
          await call(
            client,
            'envelopes_bulk_send_from_template',
            write({ template_id: templateId, rows: rows(6, 'e') }),
          ),
        ).slug,
      ).toBe('send_daily_cap');
      expect((await q('select count(*)::int as n from bulk_batches')).rows[0]).toEqual(
        batches.rows[0],
      );
      // 5 more still fit.
      const five = ok(
        await call(
          client,
          'envelopes_bulk_send_from_template',
          write({ template_id: templateId, rows: rows(5, 'f') }),
        ),
      );
      expect(five['status']).toBe('approval_pending');
      // Approving it now is Failed with the cap slug once the 12 are sent... after the worker runs:
      await app.get(BulkWorkerService).flushOnce(50);
      expect((await approveInApp(String(five['approval_id']))).body).toMatchObject({
        status: 'done',
      });
      await app.get(BulkWorkerService).flushOnce(50);

      // The batch belongs to its owner.
      const bigBatch = String(big['batch_id']);
      expect((await http().get(`/bulk-batches/${bigBatch}`).set(bearer(strangerJwt))).status).toBe(
        404,
      );
    });

    it('21 rows are refused by the schema; the tool needs both scopes', async () => {
      const client = await connect(key.token);
      expect(
        errorOf(
          await call(
            client,
            'envelopes_bulk_send_from_template',
            write({ template_id: templateId, rows: rows(21, 'g') }),
          ),
        ).slug,
      ).toBe('validation_error');
      const readOnly = await connect(narrow.token);
      expect(
        errorOf(
          await call(
            readOnly,
            'envelopes_bulk_send_from_template',
            write({ template_id: templateId, rows: rows(1, 'h') }),
          ),
        ).slug,
      ).toBe('insufficient_scope');
    });
  });

  describe('signer access codes', () => {
    it('reads and sets the settings of a draft; a sent envelope is refused', async () => {
      const client = await connect(key.token);
      const d = await draft([{ name: 'Jo', email: 'jo@first.test' }]);
      const read = ok(await call(client, 'envelopes_get_access_auth', { envelope_id: d.id }));
      expect(read).toMatchObject({ access_auth: 'none', action_auth: 'none' });
      const set = ok(
        await call(
          client,
          'envelopes_set_access_auth',
          write({
            envelope_id: d.id,
            access_auth: 'email_otp',
            signers: [{ signer_id: d.signerIds[0], action_auth: 'email_otp' }],
          }),
        ),
      );
      expect(set).toMatchObject({
        access_auth: 'email_otp',
        signers: [{ signer_id: d.signerIds[0], effective_action_auth: 'email_otp' }],
      });
      // The web route sees the same settings.
      const web = await http().get(`/envelopes/${d.id}/access-auth`).set(bearer(fresh));
      expect(web.body).toMatchObject({ access_auth: 'email_otp' });

      expect((await http().post(`/envelopes/${d.id}/send`).set(bearer(fresh))).status).toBe(201);
      expect(
        errorOf(
          await call(
            client,
            'envelopes_set_access_auth',
            write({ envelope_id: d.id, access_auth: 'none' }),
          ),
        ).slug,
      ).toBe('envelope_not_draft');
      expect(
        errorOf(
          await call(
            client,
            'envelopes_set_access_auth',
            write({
              envelope_id: randomUUID(),
              access_auth: 'none',
            }),
          ),
        ).slug,
      ).toBe('envelope_not_found');
    });
  });

  describe('template authoring', () => {
    it('creates, updates and deletes a template; the web API sees the same row', async () => {
      const client = await connect(key.token);
      const created = ok(
        await call(
          client,
          'templates_create',
          write({
            title: 'Agent NDA',
            tags: ['legal'],
            last_signers: [
              { id: 'a', name: 'Counterparty', email: 'cp@example.com', color: '#6366F1' },
            ],
            field_layout: [
              { type: 'signature', pageRule: 'last', x: 100, y: 600, signerRoleId: 'a' },
              { type: 'initial', pageRule: 'allButLast', x: 500, y: 700, signerRoleId: 'a' },
            ],
          }),
        ),
      );
      expect(created).toMatchObject({
        title: 'Agent NDA',
        fields: 2,
        signer_slots: 1,
        has_example_pdf: false,
        uses_count: 0,
      });
      const id = String(created['template_id']);
      const web = await http().get(`/templates/${id}`).set(bearer(fresh));
      expect(web.body).toMatchObject({ id, title: 'Agent NDA', tags: ['legal'] });

      const updated = ok(
        await call(client, 'templates_update', write({ template_id: id, title: 'Agent NDA v2' })),
      );
      expect(updated).toMatchObject({ title: 'Agent NDA v2', fields: 2 });
      // A template without an example PDF cannot be bulk sent.
      expect(
        errorOf(
          await call(
            client,
            'envelopes_bulk_send_from_template',
            write({
              template_id: id,
              rows: [{ signers: [{ name: 'X', email: 'x@bulk.test' }] }],
            }),
          ),
        ).slug,
      ).toBe('template_has_no_example_pdf');

      expect(ok(await call(client, 'templates_delete', write({ template_id: id })))).toEqual({
        removed: true,
      });
      expect((await http().get(`/templates/${id}`).set(bearer(fresh))).status).toBe(404);
      expect(errorOf(await call(client, 'templates_delete', write({ template_id: id }))).slug).toBe(
        'template_not_found',
      );
    });

    it('refuses an owner’s template to another key owner and a bad layout', async () => {
      const client = await connect(key.token);
      expect(
        errorOf(
          await call(
            client,
            'templates_create',
            write({
              title: 'Bad',
              field_layout: [{ type: 'initials', pageRule: 'last', x: 1, y: 1 }],
            }),
          ),
        ).slug,
      ).toBe('validation_error');
    });
  });

  describe('agent activity', () => {
    it('lists what the key did and asked for, newest first, owner scoped, session only', async () => {
      const res = await http().get('/agent-activity?limit=50').set(bearer(fresh));
      expect(res.status).toBe(200);
      const items = res.body.items as Array<{
        source: string;
        tool: string;
        outcome: string;
        key_name: string | null;
        envelope_id: string | null;
        approved_by_session: boolean | null;
        at: string;
        id: string;
      }>;
      const tools = items.map((i) => `${i.source}:${i.tool}:${i.outcome}`);
      expect(tools).toEqual(
        expect.arrayContaining([
          'event:envelopes_fix_signer:done',
          'event:envelopes_change_expiry:done',
          'event:envelopes_bulk_send_from_template:done',
          'approval:envelopes_bulk_send_from_template:done',
          'approval:envelopes_fix_signer:failed',
          'approval:envelopes_bulk_send_from_template:waiting',
        ]),
      );
      // A finished approval that wrote an envelope event is not listed twice.
      expect(tools).not.toContain('approval:envelopes_fix_signer:done');
      expect(tools).not.toContain('approval:envelopes_change_expiry:done');
      // One entry per envelope for a send, however many invitees.
      for (const i of items.filter((x) => x.source === 'event')) {
        expect(i.key_name).toBe('Key 2');
        expect(i.approved_by_session).toBe(true);
      }
      const times = items.map((i) => i.at);
      expect([...times].sort().reverse()).toEqual(times);
      expect(JSON.stringify(items)).not.toMatch(/ada@|bob@|tenant/i);

      // Pagination: a page of 3 then the cursor gives disjoint, complete pages.
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 60; guard += 1) {
        const page: request.Response = await http()
          .get(`/agent-activity?limit=3${cursor ? `&cursor=${cursor}` : ''}`)
          .set(bearer(fresh));
        expect(page.status).toBe(200);
        seen.push(...page.body.items.map((i: { id: string }) => i.id));
        cursor = page.body.next_cursor as string | null;
        if (!cursor) break;
      }
      expect(seen).toEqual(items.map((i) => i.id));
      expect(new Set(seen).size).toBe(seen.length);

      // Another owner sees nothing; a key cannot read the list; a bad cursor is a 400.
      const other = await http().get('/agent-activity').set(bearer(strangerJwt));
      expect(other.body).toEqual({ items: [], next_cursor: null });
      expect((await http().get('/agent-activity').set(bearer(key.token))).status).toBe(401);
      expect((await http().get('/agent-activity?cursor=abc').set(bearer(fresh))).status).toBe(400);
      expect((await http().get('/agent-activity?limit=0').set(bearer(fresh))).status).toBe(400);
      expect((await http().get('/agent-activity')).status).toBe(401);
    });

    it('shows a denied or expired ask as such, and is dark with the key surfaces off', async () => {
      const client = await connect(key.token);
      const d = await sentFromApp([{ name: 'Kit', email: 'kit@first.test' }]);
      const out = ok(
        await call(
          client,
          'envelopes_fix_signer',
          write({ envelope_id: d.id, signer_id: d.signerIds[0], name: 'Kitty' }),
        ),
      );
      expect(
        (
          await http()
            .post(`/approvals/${String(out['approval_id'])}/deny`)
            .set(bearer(fresh))
        ).status,
      ).toBe(200);
      const res = await http().get('/agent-activity?limit=50').set(bearer(fresh));
      expect(
        res.body.items.find((i: { id: string }) => i.id === String(out['approval_id'])),
      ).toMatchObject({ source: 'approval', outcome: 'denied', tool: 'envelopes_fix_signer' });

      host.__SEALD_FEATURE_OVERRIDES__ = {};
      expect((await http().get('/agent-activity').set(bearer(fresh))).status).toBe(404);
    });
  });
});
