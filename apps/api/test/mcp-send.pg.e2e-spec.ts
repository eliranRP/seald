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
import { ApprovalsRepository } from '../src/approvals/approvals.repository';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { DB_TOKEN } from '../src/db/db.provider';
import { EmailDispatcherService } from '../src/email/email-dispatcher.service';
import { EmailSender, type EmailMessage, type EmailSendResult } from '../src/email/email-sender';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { IdempotencyRecordsRepository } from '../src/idempotency/idempotency-records.repository';
import { findTokenShapedStrings } from '../src/mcp/leak-scan';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';

/**
 * MCP steps 10 and 11 (WP-24) end to end on real Postgres, driven by the
 * SDK `Client`: send → approval_pending → the owner approves → the
 * envelope goes out exactly once, including a retry after a crash
 * injected between the write and the commit (approval decision and
 * unattended send); the daily caps (and two concurrent sends at the cap);
 * bounce/complaint and denial suspension; the remind throttle and
 * signing order; cancel; and `metadata.mcp` on the events in WP-23's
 * shape.
 *
 * Its own scratch database on the server named by
 * SUBMIT_SIGNER_DATABASE_URL; skipped when unset locally, fails in CI.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `mcp_send_e2e_${randomBytes(4).toString('hex')}`;
const MIGRATIONS = resolve(__dirname, '../db/migrations');
const APP_URL = 'http://localhost:5173';
const TOKEN_IN_LINK = /\/approve(?:\?intent=deny)?#([A-Za-z0-9_-]{43})/;

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the MCP send e2e');
}
const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
const FLAGS: Partial<Record<FeatureFlag, boolean>> = { mcpServer: true, signingOrder: true };

class CapturingSender extends EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(msg);
    return { providerId: `prv_${randomUUID()}` };
  }
}

interface Key {
  readonly id: string;
  readonly token: string;
}

describePg('MCP send, remind and cancel through owner approval (e2e, real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let app: INestApplication;
  let baseUrl: string;
  let dispatcher: EmailDispatcherService;
  const sender = new CapturingSender();
  const storage = new InMemoryStorageService();
  const owner = randomUUID();
  const OWNER_EMAIL = 'maya@example.com';
  let fresh = '';
  let pdfBytes: Buffer;
  const clients: Client[] = [];
  const keys: Record<'approve' | 'unattended' | 'strict' | 'denials', Key> = {
    approve: { id: '', token: '' },
    unattended: { id: '', token: '' },
    strict: { id: '', token: '' },
    denials: { id: '', token: '' },
  };

  function q<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) {
    if (!pool) throw new Error('pool not ready');
    return pool.query<T>(text, values);
  }

  async function insertKey(
    name: string,
    opts: { requireApproval?: boolean; allowNew?: boolean } = {},
  ): Promise<Key> {
    const k = generateApiKey();
    const scopes: ApiKeyScope[] = ['envelopes:read', 'envelopes:write', 'envelopes:send'];
    const row = await q<{ id: string }>(
      `insert into public.api_keys
         (owner_id, name, prefix, key_hash, scopes, expires_at, require_owner_approval, allow_new_recipients)
       values ($1, $2, $3, $4, $5, now() + interval '30 days', $6, $7) returning id`,
      [
        owner,
        name,
        k.prefix,
        k.keyHash,
        scopes,
        opts.requireApproval ?? true,
        opts.allowNew ?? false,
      ],
    );
    return { id: row.rows[0]!.id, token: k.token };
  }

  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** A draft made in the web app: a PDF, these signers, one signature field each. */
  async function draft(signers: Array<{ name: string; email: string }>): Promise<{
    id: string;
    signerIds: string[];
  }> {
    const env = await http().post('/envelopes').set(bearer(fresh)).send({ title: 'Supplier NDA' });
    expect(env.status).toBe(201);
    const id = env.body.id as string;
    const up = await http()
      .post(`/envelopes/${id}/upload`)
      .set(bearer(fresh))
      .attach('file', pdfBytes, { filename: 'nda.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    const ids: string[] = [];
    for (const s of signers) {
      const res = await http().post(`/envelopes/${id}/signers`).set(bearer(fresh)).send(s);
      expect(res.status).toBe(201);
      ids.push(res.body.id as string);
    }
    const res = await http()
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
      });
    expect(res.status).toBe(200);
    return { id, signerIds: ids };
  }

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'wp24-e2e', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport as Transport);
    clients.push(client);
    return client;
  }

  /** Every result is leak-scanned: no token link, no key, no signing token. */
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
    return JSON.parse(first && first.type === 'text' ? first.text : '{}') as {
      slug: string;
      retryable: boolean;
      retry_after_seconds?: number;
    };
  };
  let seq = 0;
  const write = (extra: Record<string, unknown>) => {
    seq += 1;
    return {
      idempotency_key: `wp24-key-${String(seq).padStart(6, '0')}`,
      dry_run: false,
      ...extra,
    };
  };

  async function status(id: string): Promise<string> {
    const r = await q<{ status: string }>('select status::text from envelopes where id = $1', [id]);
    return r.rows[0]!.status;
  }

  async function events(id: string) {
    const r = await q<{ event_type: string; metadata: Record<string, unknown> }>(
      `select event_type::text, metadata from envelope_events
        where envelope_id = $1 order by created_at, id`,
      [id],
    );
    return r.rows;
  }

  async function approveInApp(approvalId: string) {
    return http().post(`/approvals/${approvalId}/approve`).set(bearer(fresh));
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    const dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 4 });
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
    keys.approve = await insertKey('Key 2');
    keys.unattended = await insertKey('Unattended', { requireApproval: false, allowNew: true });
    keys.strict = await insertKey('Strict unattended', { requireApproval: false, allowNew: false });
    keys.denials = await insertKey('Denied key');

    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    pdfBytes = Buffer.from(await doc.save());

    const tk = await buildTestJwks();
    const nowS = Math.floor(Date.now() / 1000);
    fresh = await tk.sign(
      { sub: owner, email: OWNER_EMAIL, amr: [{ method: 'password', timestamp: nowS - 60 }] },
      { issuer: 'https://example.supabase.co/auth/v1', audience: 'authenticated' },
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
    };
    host.__SEALD_FEATURE_OVERRIDES__ = { ...FLAGS };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(testEnv)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(EmailSender)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    dispatcher = app.get(EmailDispatcherService);
  }, 180_000);

  beforeEach(() => {
    host.__SEALD_FEATURE_OVERRIDES__ = { ...FLAGS };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
    for (const c of clients) await c.close().catch(() => undefined);
    await app?.get<Kysely<Database>>(DB_TOKEN).destroy();
    await app?.close();
    await pool?.end();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  it('lists the send, remind and cancel tools with the flag on', async () => {
    const client = await connect(keys.approve.token);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'envelopes_preview_send',
        'envelopes_send',
        'envelopes_preview_remind',
        'envelopes_remind',
        'envelopes_cancel',
      ]),
    );
  });

  describe('send → approval_pending → owner approves → sent exactly once', () => {
    it('signed-in Approve of a new recipient; a retried key replays; metadata.mcp on every send row', async () => {
      const d = await draft([{ name: 'Nia', email: 'nia@new.test' }]);
      const client = await connect(keys.approve.token);
      const args = write({ envelope_id: d.id });
      const out = ok(await call(client, 'envelopes_send', args));
      expect(out).toMatchObject({
        status: 'approval_pending',
        approve_requires: 'session',
        review_url: `${APP_URL}/approve/${String(out['approval_id'])}/review`,
      });
      // Nothing went out yet.
      expect(await status(d.id)).toBe('draft');
      expect((await events(d.id)).filter((e) => e.event_type === 'sent')).toEqual([]);
      // Same key again: the stored answer, no second approval.
      expect(ok(await call(client, 'envelopes_send', args))).toEqual(out);

      const approved = await approveInApp(String(out['approval_id']));
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({ status: 'done' });
      expect(await status(d.id)).toBe('awaiting_others');

      const rows = await events(d.id);
      const sent = rows.filter((e) => e.event_type === 'sent');
      expect(sent).toHaveLength(1);
      const types = rows.map((e) => e.event_type);
      expect(types.indexOf('approval_decided')).toBeLessThan(types.indexOf('sent'));
      const mcp = McpEventMetadataSchema.parse(sent[0]!.metadata['mcp']);
      expect(mcp).toEqual({
        auth: 'api_key',
        key_id: keys.approve.id,
        key_prefix: expect.any(String),
        key_name: 'Key 2',
        oauth_client_id: null,
        oauth_grant_id: null,
        acting_for_user_id: owner,
        acting_for_email: OWNER_EMAIL,
        tool: 'envelopes_send',
        approval: 'email',
        approved_by_session: true,
      });
      expect(sent[0]!.metadata['new_recipient_count']).toBe(1);
      expect(await app.get(EnvelopesRepository).verifyEventChain(d.id)).toMatchObject({
        chain_intact: true,
      });

      const polled = ok(
        await call(client, 'approvals_get', { approval_id: String(out['approval_id']) }),
      );
      expect(polled).toEqual({ status: 'done' });
      // Agent retries after done: still one send.
      expect(ok(await call(client, 'envelopes_send', args))).toEqual(out);
      expect((await events(d.id)).filter((e) => e.event_type === 'sent')).toHaveLength(1);
    });

    it('login-free Approve from the email link records approved_by_session false', async () => {
      // Sent once from the web app, so Ada is known and Approve is login-free.
      const first = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
      expect((await http().post(`/envelopes/${first.id}/send`).set(bearer(fresh))).status).toBe(
        201,
      );
      const webSent = (await events(first.id)).find((e) => e.event_type === 'sent');
      expect(webSent?.metadata).toEqual({});

      const d = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
      const client = await connect(keys.approve.token);
      const out = ok(await call(client, 'envelopes_send', write({ envelope_id: d.id })));
      expect(out['approve_requires']).toBe('link');
      const before = sender.sent.length;
      await dispatcher.flushOnce(50);
      const mail = sender.sent
        .slice(before)
        .filter((m) => m.subject.startsWith('Approve?'))
        .at(-1);
      const token = TOKEN_IN_LINK.exec(mail?.html ?? '')?.[1];
      expect(token).toBeDefined();
      const preview = await http().post('/approvals/from-email/preview').send({ token });
      const cookie =
        ([] as string[])
          .concat(preview.headers['set-cookie'] ?? [])
          .find((c) => c.startsWith('seald_approval='))
          ?.split(';')[0] ?? '';
      const decided = await http()
        .post('/approvals/from-email')
        .set('Origin', APP_URL)
        .set('Cookie', cookie)
        .send({ token, decision: 'approve', csrf: preview.body.csrf });
      expect(decided.body).toMatchObject({ state: 'done', decided: true });
      const sent = (await events(d.id)).filter((e) => e.event_type === 'sent');
      expect(sent).toHaveLength(1);
      const mcp = McpEventMetadataSchema.parse(sent[0]!.metadata['mcp']);
      expect(mcp).toMatchObject({ approval: 'email', approved_by_session: false });
      expect(sent[0]!.metadata['new_recipient_count']).toBe(0);
    });

    it('a crash after the send and before the commit sends nothing; the next Approve sends once', async () => {
      const d = await draft([{ name: 'Cora', email: 'cora@new.test' }]);
      const client = await connect(keys.approve.token);
      const out = ok(await call(client, 'envelopes_send', write({ envelope_id: d.id })));
      const approvalId = String(out['approval_id']);

      // Fail the last write of the decision: the send already ran inside it.
      jest
        .spyOn(app.get(ApprovalsRepository), 'markCompleted')
        .mockRejectedValueOnce(new Error('injected crash before commit'));
      const crashed = await approveInApp(approvalId);
      expect(crashed.status).toBe(500);
      expect(await status(d.id)).toBe('draft');
      expect(await events(d.id)).toEqual([
        expect.objectContaining({ event_type: 'created' }),
        expect.objectContaining({ event_type: 'pdf_uploaded' }),
      ]);
      const invites = await q(
        `select 1 from outbound_emails where envelope_id = $1 and kind = 'invite'`,
        [d.id],
      );
      expect(invites.rowCount).toBe(0);
      expect(ok(await call(client, 'approvals_get', { approval_id: approvalId }))).toEqual({
        status: 'pending',
      });

      const retried = await approveInApp(approvalId);
      expect(retried.status).toBe(200);
      expect(retried.body).toMatchObject({ status: 'done' });
      expect(await status(d.id)).toBe('awaiting_others');
      const rows = await events(d.id);
      expect(rows.filter((e) => e.event_type === 'sent')).toHaveLength(1);
      expect(rows.filter((e) => e.event_type === 'approval_decided')).toHaveLength(1);
      const sentInvites = await q(
        `select 1 from outbound_emails where envelope_id = $1 and kind = 'invite'`,
        [d.id],
      );
      expect(sentInvites.rowCount).toBe(1);
      // A second Approve finds the decision taken.
      expect((await approveInApp(approvalId)).body).toMatchObject({ status: 'done' });
      expect((await events(d.id)).filter((e) => e.event_type === 'sent')).toHaveLength(1);
    });
  });

  describe('unattended key (owner turned approval off)', () => {
    it('needs the preview token; a crash before the commit leaves no claim and no send; the retry sends once', async () => {
      const d = await draft([{ name: 'Una', email: 'una@new.test' }]);
      const client = await connect(keys.unattended.token);
      expect(errorOf(await call(client, 'envelopes_send', write({ envelope_id: d.id }))).slug).toBe(
        'confirmation_required',
      );
      expect(
        errorOf(
          await call(
            client,
            'envelopes_send',
            write({ envelope_id: d.id, confirmation_token: 'x'.repeat(43) }),
          ),
        ).slug,
      ).toBe('confirmation_invalid');

      const preview = ok(
        await call(client, 'envelopes_preview_send', write({ envelope_id: d.id })),
      );
      expect(preview).toMatchObject({ ready: true, approval: 'none', expires_in_seconds: 600 });
      const token = String(preview['confirmation_token']);
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const args = write({ envelope_id: d.id, confirmation_token: token });
      jest
        .spyOn(app.get(IdempotencyRecordsRepository), 'complete')
        .mockRejectedValueOnce(new Error('injected crash before commit'));
      await expect(client.callTool({ name: 'envelopes_send', arguments: args })).rejects.toThrow();
      expect(await status(d.id)).toBe('draft');
      expect((await events(d.id)).filter((e) => e.event_type === 'sent')).toEqual([]);
      const claims = await q(`select 1 from idempotency_records where idempotency_key = $1`, [
        `mcp:${keys.unattended.id}:${String(args.idempotency_key)}`,
      ]);
      expect(claims.rowCount).toBe(0);
      const unconsumed = await q(
        `select 1 from mcp_confirmations where envelope_id = $1 and consumed_at is null`,
        [d.id],
      );
      expect(unconsumed.rowCount).toBe(1);

      const sent = ok(await call(client, 'envelopes_send', args));
      expect(sent).toEqual({
        status: 'sent',
        envelope_id: d.id,
        envelope_status: 'awaiting_others',
      });
      // A retry of the same key replays; a new key with the spent token finds it sent; one send only.
      expect(ok(await call(client, 'envelopes_send', args))).toEqual(sent);
      expect(
        errorOf(
          await call(
            client,
            'envelopes_send',
            write({ envelope_id: d.id, confirmation_token: token }),
          ),
        ).slug,
      ).toBe('envelope_not_draft');
      const rows = (await events(d.id)).filter((e) => e.event_type === 'sent');
      expect(rows).toHaveLength(1);
      expect(McpEventMetadataSchema.parse(rows[0]!.metadata['mcp'])).toMatchObject({
        approval: 'unattended',
        approved_by_session: false,
        key_name: 'Unattended',
        tool: 'envelopes_send',
      });
    });

    it('a replayed preview never repeats the token; an edit after the preview voids it', async () => {
      const d = await draft([{ name: 'Una', email: 'una@new.test' }]);
      const client = await connect(keys.unattended.token);
      const args = write({ envelope_id: d.id });
      const first = ok(await call(client, 'envelopes_preview_send', args));
      expect(first['confirmation_token']).toBeDefined();
      const replay = ok(await call(client, 'envelopes_preview_send', args));
      expect(replay).not.toHaveProperty('confirmation_token');
      const stored = await q<{ body: string }>(
        `select response_body::text as body from idempotency_records where idempotency_key = $1`,
        [`mcp:${keys.unattended.id}:${String(args.idempotency_key)}`],
      );
      expect(stored.rows[0]?.body).not.toContain(String(first['confirmation_token']));

      // The draft changes after the preview: the token no longer matches.
      await http()
        .put(`/envelopes/${d.id}/fields`)
        .set(bearer(fresh))
        .send({
          fields: [
            {
              signer_id: d.signerIds[0],
              kind: 'signature',
              page: 1,
              x: 0.5,
              y: 0.5,
              width: 0.2,
              height: 0.05,
              required: true,
            },
          ],
        })
        .expect(200);
      expect(
        errorOf(
          await call(
            client,
            'envelopes_send',
            write({ envelope_id: d.id, confirmation_token: String(first['confirmation_token']) }),
          ),
        ).slug,
      ).toBe('confirmation_invalid');
      expect(await status(d.id)).toBe('draft');
    });

    it('a recipient the key has not reached falls back to approval, with a sign-in', async () => {
      const d = await draft([{ name: 'Vee', email: 'vee@new.test' }]);
      const client = await connect(keys.strict.token);
      const out = ok(await call(client, 'envelopes_send', write({ envelope_id: d.id })));
      expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
      expect(await status(d.id)).toBe('draft');
    });
  });

  describe('daily caps', () => {
    /** Fake today's MCP usage on a throwaway envelope; returns a cleanup. */
    async function usage(sends: number, newRecipients: number): Promise<() => Promise<void>> {
      const base = await draft([{ name: 'Filler', email: 'filler@new.test' }]);
      const ids: string[] = [];
      for (let i = 0; i < sends; i++) {
        // Each fake send is its own envelope (a copy of the filler draft).
        const copy = await q<{ id: string }>(
          `insert into envelopes
           select (jsonb_populate_record(null::envelopes,
                     to_jsonb(e) || jsonb_build_object('id', gen_random_uuid(), 'short_code', $2::text))).*
             from envelopes e where e.id = $1
           returning id`,
          [base.id, `F${randomBytes(6).toString('hex').toUpperCase()}`],
        );
        const id = copy.rows[0]!.id;
        ids.push(id);
        const metadata = {
          mcp: { approval: 'unattended' },
          new_recipient_count: i === 0 ? newRecipients : 0,
        };
        await q(
          `insert into envelope_events (envelope_id, actor_kind, event_type, metadata)
           values ($1, 'system', 'sent', $2::jsonb)`,
          [id, JSON.stringify(metadata)],
        );
      }
      return async () => {
        await q(`delete from envelope_events where envelope_id = any($1::uuid[])`, [ids]);
        await q(`delete from envelopes where id = any($1::uuid[])`, [ids]);
      };
    }

    async function usedToday(): Promise<{ sends: number; recipients: number }> {
      const client = await connect(keys.approve.token);
      const me = ok(await call(client, 'me_get', {}));
      const quotas = me['quotas'] as { sends_remaining: number; new_recipients_remaining: number };
      return {
        sends: 20 - quotas.sends_remaining,
        recipients: 25 - quotas.new_recipients_remaining,
      };
    }

    it('20 sends a day: the request is refused with send_daily_cap and retry_after_seconds', async () => {
      const used = await usedToday();
      const cleanup = await usage(20 - used.sends, 0);
      try {
        const d = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
        const client = await connect(keys.approve.token);
        const e = errorOf(await call(client, 'envelopes_send', write({ envelope_id: d.id })));
        expect(e).toMatchObject({ slug: 'send_daily_cap', retryable: true });
        expect(e.retry_after_seconds).toBeGreaterThan(0);
        expect(ok(await call(client, 'me_get', {}))['quotas']).toMatchObject({
          sends_remaining: 0,
        });
      } finally {
        await cleanup();
      }
    });

    it('25 new recipients a day: recipient_daily_cap; a known recipient still goes', async () => {
      const used = await usedToday();
      const cleanup = await usage(1, 25 - used.recipients);
      try {
        const client = await connect(keys.approve.token);
        const fresh1 = await draft([{ name: 'Wes', email: 'wes@new.test' }]);
        expect(
          errorOf(await call(client, 'envelopes_send', write({ envelope_id: fresh1.id }))).slug,
        ).toBe('recipient_daily_cap');
        const known = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
        expect(
          ok(await call(client, 'envelopes_send', write({ envelope_id: known.id }))),
        ).toMatchObject({ status: 'approval_pending' });
      } finally {
        await cleanup();
      }
    });

    it('two concurrent sends at the cap: one succeeds, one is send_daily_cap', async () => {
      const used = await usedToday();
      const cleanup = await usage(19 - used.sends, 0);
      try {
        const client = await connect(keys.unattended.token);
        const a = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
        const b = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
        const ta = ok(await call(client, 'envelopes_preview_send', write({ envelope_id: a.id })));
        const tb = ok(await call(client, 'envelopes_preview_send', write({ envelope_id: b.id })));
        const [ra, rb] = await Promise.all([
          call(
            client,
            'envelopes_send',
            write({ envelope_id: a.id, confirmation_token: ta['confirmation_token'] }),
          ),
          call(
            client,
            'envelopes_send',
            write({ envelope_id: b.id, confirmation_token: tb['confirmation_token'] }),
          ),
        ]);
        const outcomes = [ra, rb].map((r) => (r.isError ? errorOf(r).slug : 'sent')).sort();
        expect(outcomes).toEqual(['send_daily_cap', 'sent']);
        const statuses = [await status(a.id), await status(b.id)].sort();
        expect(statuses).toEqual(['awaiting_others', 'draft']);
      } finally {
        await cleanup();
      }
    });

    it('a cap reached while an approval waits makes Approve Failed, nothing sent', async () => {
      const client = await connect(keys.approve.token);
      const d = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
      const out = ok(await call(client, 'envelopes_send', write({ envelope_id: d.id })));
      const used = await usedToday();
      const cleanup = await usage(20 - used.sends, 0);
      try {
        const res = await approveInApp(String(out['approval_id']));
        expect(res.body).toMatchObject({ status: 'failed', result_slug: 'send_daily_cap' });
        expect(await status(d.id)).toBe('draft');
      } finally {
        await cleanup();
      }
    });
  });

  describe('suspension', () => {
    it('two spam complaints in 7 days suspend envelopes:send for every key of the owner', async () => {
      const d = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
      const ids: string[] = [];
      for (let i = 0; i < 2; i++) {
        const providerId = `prv_complaint_${i}_${randomBytes(4).toString('hex')}`;
        const row = await q<{ id: string }>(
          `insert into outbound_emails (envelope_id, kind, to_email, to_name, payload, status, sent_at, provider_id)
           values ($1, 'invite', 'ada@known.test', 'Ada', '{}'::jsonb, 'sent', now(), $2) returning id`,
          [d.id, providerId],
        );
        ids.push(row.rows[0]!.id);
        await q(
          `insert into email_webhooks (provider, event_type, provider_id, payload)
           values ('resend', 'email.complained', $1, '{}'::jsonb)`,
          [providerId],
        );
      }
      try {
        for (const key of [keys.approve, keys.unattended]) {
          const client = await connect(key.token);
          expect(
            errorOf(await call(client, 'envelopes_send', write({ envelope_id: d.id }))).slug,
          ).toBe('send_suspended');
        }
      } finally {
        await q(`delete from email_webhooks where event_type = 'email.complained'`);
        await q(`delete from outbound_emails where id = any($1::uuid[])`, [ids]);
      }
      const client = await connect(keys.approve.token);
      expect(ok(await call(client, 'envelopes_send', write({ envelope_id: d.id })))).toMatchObject({
        status: 'approval_pending',
      });
    });

    it('three denials of a key in 24 hours suspend that key only', async () => {
      const client = await connect(keys.denials.token);
      for (let i = 0; i < 3; i++) {
        const d = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
        const out = ok(await call(client, 'envelopes_send', write({ envelope_id: d.id })));
        const denied = await http()
          .post(`/approvals/${String(out['approval_id'])}/deny`)
          .set(bearer(fresh));
        expect(denied.status).toBe(200);
      }
      const d = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
      expect(errorOf(await call(client, 'envelopes_send', write({ envelope_id: d.id }))).slug).toBe(
        'key_send_suspended',
      );
      const other = await connect(keys.approve.token);
      expect(ok(await call(other, 'envelopes_send', write({ envelope_id: d.id })))).toMatchObject({
        status: 'approval_pending',
      });
    });
  });

  describe('remind', () => {
    it('keeps the hourly throttle, then asks the owner and reminds once on Approve', async () => {
      const d = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
      expect((await http().post(`/envelopes/${d.id}/send`).set(bearer(fresh))).status).toBe(201);
      const client = await connect(keys.approve.token);
      const args = { envelope_id: d.id, signer_id: d.signerIds[0] };
      const throttled = errorOf(await call(client, 'envelopes_remind', write(args)));
      expect(throttled).toMatchObject({ slug: 'remind_throttled', retryable: true });
      expect(throttled.retry_after_seconds).toBeGreaterThan(0);

      await q(
        `update outbound_emails set created_at = now() - interval '2 hours' where envelope_id = $1`,
        [d.id],
      );
      expect(ok(await call(client, 'envelopes_preview_remind', write(args)))).toEqual({
        envelope_id: d.id,
        signer: { id: d.signerIds[0], name: 'Ada', email: 'ada@known.test' },
        approval: 'email',
      });
      const out = ok(await call(client, 'envelopes_remind', write(args)));
      expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'link' });
      const approved = await approveInApp(String(out['approval_id']));
      expect(approved.body).toMatchObject({ status: 'done', result: { status: 'queued' } });
      const reminders = await q(
        `select 1 from outbound_emails where envelope_id = $1 and kind = 'reminder'`,
        [d.id],
      );
      expect(reminders.rowCount).toBe(1);
      const ev = (await events(d.id)).filter((e) => e.event_type === 'reminder_sent');
      expect(ev).toHaveLength(1);
      expect(McpEventMetadataSchema.parse(ev[0]!.metadata['mcp'])).toMatchObject({
        tool: 'envelopes_remind',
        approval: 'email',
        approved_by_session: true,
      });
    });

    it('respects signing order: a later step is not_your_turn', async () => {
      const d = await draft([
        { name: 'Ada', email: 'ada@known.test' },
        { name: 'Bo', email: 'bo@known.test' },
      ]);
      await http()
        .put(`/envelopes/${d.id}/signing-order`)
        .set(bearer(fresh))
        .send({
          delivery_mode: 'sequential',
          signers: [
            { signer_id: d.signerIds[0], signing_order: 1 },
            { signer_id: d.signerIds[1], signing_order: 2 },
          ],
        })
        .expect(200);
      expect((await http().post(`/envelopes/${d.id}/send`).set(bearer(fresh))).status).toBe(201);
      await q(
        `update outbound_emails set created_at = now() - interval '2 hours' where envelope_id = $1`,
        [d.id],
      );
      const client = await connect(keys.approve.token);
      expect(
        errorOf(
          await call(
            client,
            'envelopes_remind',
            write({ envelope_id: d.id, signer_id: d.signerIds[1] }),
          ),
        ).slug,
      ).toBe('not_your_turn');
    });
  });

  describe('cancel', () => {
    it('always needs a signed-in Approve; withdrawal mail goes out; metadata.mcp on the cancel rows', async () => {
      const d = await draft([{ name: 'Ada', email: 'ada@known.test' }]);
      expect((await http().post(`/envelopes/${d.id}/send`).set(bearer(fresh))).status).toBe(201);
      const client = await connect(keys.unattended.token);
      const out = ok(await call(client, 'envelopes_cancel', write({ envelope_id: d.id })));
      expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
      expect(await status(d.id)).toBe('awaiting_others');

      const approved = await approveInApp(String(out['approval_id']));
      expect(approved.body).toMatchObject({ status: 'done', result: { status: 'canceled' } });
      expect(await status(d.id)).toBe('canceled');
      const withdrawn = await q(
        `select 1 from outbound_emails where envelope_id = $1 and kind = 'withdrawn_to_signer'`,
        [d.id],
      );
      expect(withdrawn.rowCount).toBe(1);
      const rows = await events(d.id);
      for (const type of ['canceled', 'session_invalidated_by_cancel']) {
        const ev = rows.find((e) => e.event_type === type);
        expect(McpEventMetadataSchema.parse(ev?.metadata['mcp'])).toMatchObject({
          tool: 'envelopes_cancel',
          approval: 'email',
        });
      }
      // The web-app send's rows stay attribution-free.
      expect(rows.find((e) => e.event_type === 'sent')?.metadata).toEqual({});
      expect(await app.get(EnvelopesRepository).verifyEventChain(d.id)).toMatchObject({
        chain_intact: true,
      });
      expect(
        errorOf(await call(client, 'envelopes_cancel', write({ envelope_id: d.id }))).slug,
      ).toBe('envelope_terminal');
    });
  });
});
