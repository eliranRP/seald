import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
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
import type { ApiKeyScope, ApprovalCard, ApprovalKind, FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
import { generateApiKey } from '../src/api-keys/api-key-secret';
import { AppModule } from '../src/app.module';
import { ApprovalsRepository } from '../src/approvals/approvals.repository';
import { ApprovalsService } from '../src/approvals/approvals.service';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { DB_TOKEN } from '../src/db/db.provider';
import { EmailDispatcherService } from '../src/email/email-dispatcher.service';
import { EmailSender, type EmailMessage, type EmailSendResult } from '../src/email/email-sender';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { findTokenShapedStrings } from '../src/mcp/leak-scan';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';

/**
 * Owner approvals (WP-21; MCP steps 7a, 7c, 7d server side) end to end on
 * real Postgres: migration 0030, the request hook, the approval email
 * minted at dispatch, the public Approve/Deny API (preview, CSRF,
 * Origin, cookie), the in-app queue on the session, owner edit re-mint,
 * agent re-preview, expiry, key revocation, the credential boundary, and
 * concurrent Approve vs Deny (exactly one wins).
 *
 * Its own scratch database on the server named by
 * SUBMIT_SIGNER_DATABASE_URL; skipped when unset locally, fails in CI
 * when unset.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `approvals_e2e_${randomBytes(4).toString('hex')}`;
const MIGRATIONS = resolve(__dirname, '../db/migrations');
const APP_URL = 'http://localhost:5173';

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the approvals pg e2e');
}
const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

class CapturingSender extends EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(msg);
    return { providerId: `prv_${this.sent.length}` };
  }
}

const TOKEN_IN_LINK = /\/approve(?:\?intent=deny)?#([A-Za-z0-9_-]{43})/;

describePg('owner approvals (e2e, real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let app: INestApplication;
  let baseUrl: string;
  let svc: ApprovalsService;
  let dispatcher: EmailDispatcherService;
  const sender = new CapturingSender();
  const storage = new InMemoryStorageService();
  const ownerA = randomUUID();
  const ownerB = randomUUID();
  let keyA = { id: '', token: '' };
  let keyB = { id: '', token: '' };
  let fresh = '';
  let stale = '';
  let sessionB = '';
  let pdfBytes: Buffer;
  const clients: Client[] = [];

  function q<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) {
    if (!pool) throw new Error('pool not ready');
    return pool.query<T>(text, values);
  }

  async function insertKey(owner: string, scopes: ApiKeyScope[], name: string) {
    const k = generateApiKey();
    const row = await q<{ id: string }>(
      `insert into public.api_keys (owner_id, name, prefix, key_hash, scopes, expires_at)
       values ($1, $2, $3, $4, $5, now() + interval '30 days') returning id`,
      [owner, name, k.prefix, k.keyHash, scopes],
    );
    return { id: row.rows[0]!.id, token: k.token };
  }

  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** A draft with a PDF, these signers and one signature field each, made in the web app. */
  async function draft(signers: Array<{ name: string; email: string }>, token = fresh) {
    const env = await http().post('/envelopes').set(bearer(token)).send({ title: 'Supplier NDA' });
    expect(env.status).toBe(201);
    const id = env.body.id as string;
    const up = await http()
      .post(`/envelopes/${id}/upload`)
      .set(bearer(token))
      .attach('file', pdfBytes, { filename: 'nda.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    const ids: string[] = [];
    for (const s of signers) {
      const res = await http().post(`/envelopes/${id}/signers`).set(bearer(token)).send(s);
      expect(res.status).toBe(201);
      ids.push(res.body.id as string);
    }
    await placeFields(id, ids, 0.1, token);
    return { id, signerIds: ids };
  }

  async function placeFields(id: string, signerIds: string[], x: number, token = fresh) {
    const res = await http()
      .put(`/envelopes/${id}/fields`)
      .set(bearer(token))
      .send({
        fields: signerIds.map((signer_id, i) => ({
          signer_id,
          kind: 'signature',
          page: 1,
          x,
          y: 0.1 + i * 0.1,
          width: 0.2,
          height: 0.05,
          required: true,
        })),
      });
    expect(res.status).toBe(200);
  }

  const ask = (kind: ApprovalKind, args: Record<string, unknown>, keyId = keyA.id) =>
    svc.request({ requester: { ownerId: ownerA, apiKeyId: keyId }, kind, args });

  /** Drain the outbox; return the messages sent in this flush. */
  async function flush(): Promise<EmailMessage[]> {
    const before = sender.sent.length;
    await dispatcher.flushOnce(50);
    return sender.sent.slice(before);
  }

  /** Flush and return the token of the newest approval email. */
  async function mailedToken(): Promise<{ token: string; mail: EmailMessage }> {
    const mails = (await flush()).filter((m) => m.subject.startsWith('Approve?'));
    const mail = mails.at(-1);
    if (!mail) throw new Error('no approval email went out');
    const token = TOKEN_IN_LINK.exec(mail.html)?.[1];
    if (!token) throw new Error('no token in the approval email');
    return { token, mail };
  }

  interface PageSession {
    readonly card: ApprovalCard;
    readonly cookie: string;
  }

  /** What the `/approve` page does on load: preview, keep the CSRF value and cookie. */
  async function open(token: string): Promise<PageSession> {
    const res = await http().post('/approvals/from-email/preview').send({ token });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(String(res.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const cookie = setCookie.find((c) => c.startsWith('seald_approval='))?.split(';')[0] ?? '';
    return { card: res.body as ApprovalCard, cookie };
  }

  function decide(token: string, page: PageSession, decision: 'approve' | 'deny') {
    return http()
      .post('/approvals/from-email')
      .set('Origin', APP_URL)
      .set('Cookie', page.cookie)
      .set('User-Agent', 'MailApp/1')
      .send({ token, decision, csrf: page.card.csrf });
  }

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'wp21-e2e', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport as Transport);
    clients.push(client);
    return client;
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
    await q(
      `insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now()), ($3, $4, null)`,
      [ownerA, 'maya@example.com', ownerB, 'bea@example.com'],
    );
    const scopes: ApiKeyScope[] = ['envelopes:read', 'envelopes:send'];
    keyA = await insertKey(ownerA, scopes, 'Key 2');
    keyB = await insertKey(ownerB, scopes, 'Key 1');

    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    pdfBytes = Buffer.from(await doc.save());

    const tk = await buildTestJwks();
    const opts = { issuer: 'https://example.supabase.co/auth/v1', audience: 'authenticated' };
    const nowS = Math.floor(Date.now() / 1000);
    fresh = await tk.sign(
      {
        sub: ownerA,
        email: 'maya@example.com',
        amr: [{ method: 'password', timestamp: nowS - 60 }],
      },
      opts,
    );
    stale = await tk.sign(
      {
        sub: ownerA,
        email: 'maya@example.com',
        amr: [{ method: 'password', timestamp: nowS - 13 * 3600 }],
      },
      opts,
    );
    sessionB = await tk.sign(
      {
        sub: ownerB,
        email: 'bea@example.com',
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
      // The breaker counts every outbound row; keep it out of the way here.
      EMAIL_PROVIDER_DAILY_QUOTA: 100_000,
      EMAIL_PROVIDER_MONTHLY_QUOTA: 1_000_000,
    };
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true };
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
    svc = app.get(ApprovalsService);
    dispatcher = app.get(EmailDispatcherService);
  }, 180_000);

  beforeEach(() => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true };
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

  describe('migration 0030', () => {
    it('creates both tables with RLS on and no policies, plus the enum labels', async () => {
      for (const table of ['mcp_approvals', 'mcp_confirmations']) {
        const rls = await q<{ relrowsecurity: boolean }>(
          `select relrowsecurity from pg_class where oid = $1::regclass`,
          [`public.${table}`],
        );
        expect(rls.rows[0]?.relrowsecurity).toBe(true);
        const policies = await q(`select 1 from pg_policies where tablename = $1`, [table]);
        expect(policies.rowCount).toBe(0);
      }
      const kinds = await q<{ l: string }>(
        `select unnest(enum_range(null::email_kind))::text as l`,
      );
      expect(kinds.rows.map((r) => r.l)).toEqual(
        expect.arrayContaining(['approval_request', 'approval_denied']),
      );
      const events = await q<{ l: string }>(
        `select unnest(enum_range(null::event_type))::text as l`,
      );
      expect(events.rows.map((r) => r.l)).toContain('approval_decided');
    });

    it('the up script is idempotent', async () => {
      const sql = readFileSync(resolve(MIGRATIONS, '0030_mcp_approvals.sql'), 'utf8');
      await q(sql);
      await q(sql);
    });
  });

  describe('flag and credential boundary', () => {
    it('404s every approvals route while mcpServer and publicApi are off', async () => {
      host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: false, publicApi: false };
      expect((await http().get('/approvals').set(bearer(fresh))).status).toBe(404);
      expect(
        (
          await http()
            .post('/approvals/from-email/preview')
            .send({ token: 'a'.repeat(43) })
        ).status,
      ).toBe(404);
    });

    it('an API key is never a session on /approvals/*: 401', async () => {
      const id = randomUUID();
      for (const [method, path] of [
        ['get', '/approvals'],
        ['get', `/approvals/${id}`],
        ['post', `/approvals/${id}/approve`],
        ['post', `/approvals/${id}/deny`],
        ['post', `/approvals/${id}/refresh`],
      ] as const) {
        const res = await http()[method](path).set(bearer(keyA.token));
        expect({ path, status: res.status }).toEqual({ path, status: 401 });
      }
    });
  });

  describe('known recipient: login-free Approve from the email', () => {
    let envelopeId = '';
    let signerId = '';

    beforeAll(async () => {
      // Sent from the web app, so Ada is a known recipient.
      const d = await draft([{ name: 'Ada', email: 'ada@acme.test' }]);
      envelopeId = d.id;
      signerId = d.signerIds[0]!;
      const sent = await http().post(`/envelopes/${envelopeId}/send`).set(bearer(fresh));
      expect(sent.status).toBe(201);
      await flush();
      // The invite went out two hours ago, so a manual remind is allowed.
      await q(
        `update outbound_emails set created_at = now() - interval '2 hours' where envelope_id = $1`,
        [envelopeId],
      );
    });

    it('request → email (Approve, Review fields, small Deny) → preview → CSRF → one decision → action ran', async () => {
      const pending = await ask('envelope_remind', {
        envelope_id: envelopeId,
        signer_id: signerId,
      });
      expect(pending).toMatchObject({
        status: 'approval_pending',
        approve_requires: 'link',
        review_url: `${APP_URL}/approve/${pending.approval_id}/review`,
      });
      expect(JSON.stringify(pending)).not.toMatch(/approve#/);

      // The outbox row holds ids only; the token is minted at dispatch.
      const stored = await q<{ payload: Record<string, unknown>; to_email: string }>(
        `select payload, to_email from outbound_emails where dedupe_key = $1`,
        [`approval_request:${pending.approval_id}`],
      );
      expect(Object.keys(stored.rows[0]?.payload ?? {}).sort()).toEqual([
        'approval_id',
        'subject_hash',
      ]);
      expect(stored.rows[0]?.to_email).toBe('maya@example.com');
      const { token, mail } = await mailedToken();
      expect(mail.to.email).toBe('maya@example.com');
      expect(mail.html).toContain(`${APP_URL}/approve#${token}`);
      expect(mail.html).toContain('>Review fields</a>');
      expect(mail.html).toContain(`${APP_URL}/approve?intent=deny#${token}`);
      const row = await q<{ link_token_hash: string }>(
        `select link_token_hash from mcp_approvals where id = $1`,
        [pending.approval_id],
      );
      expect(row.rows[0]?.link_token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(await q(`select * from outbound_emails`))).not.toContain(token);

      // Preview does not decide.
      const page = await open(token);
      expect(page.card).toMatchObject({ state: 'pending', approve_requires: 'link' });
      expect(page.cookie).toMatch(/^seald_approval=/);
      const undecided = await q(`select approved_at, denied_at from mcp_approvals where id = $1`, [
        pending.approval_id,
      ]);
      expect(undecided.rows[0]).toEqual({ approved_at: null, denied_at: null });

      // A POST without the CSRF value, with a wrong one, without the cookie or
      // from another Origin decides nothing.
      const noCsrf = await http()
        .post('/approvals/from-email')
        .set('Origin', APP_URL)
        .set('Cookie', page.cookie)
        .send({ token, decision: 'approve' });
      expect(noCsrf.status).toBe(403);
      expect(noCsrf.body).toEqual({ error: 'csrf_invalid' });
      const bad = await http()
        .post('/approvals/from-email')
        .set('Origin', APP_URL)
        .set('Cookie', page.cookie)
        .send({ token, decision: 'approve', csrf: 'A'.repeat(43) });
      expect(bad.body).toEqual({ error: 'csrf_invalid' });
      const noCookie = await http()
        .post('/approvals/from-email')
        .set('Origin', APP_URL)
        .send({ token, decision: 'approve', csrf: page.card.csrf });
      expect(noCookie.body).toEqual({ error: 'csrf_invalid' });
      const evil = await http()
        .post('/approvals/from-email')
        .set('Origin', 'https://evil.test')
        .set('Cookie', page.cookie)
        .send({ token, decision: 'approve', csrf: page.card.csrf });
      expect(evil.body).toEqual({ error: 'csrf_invalid' });

      const remindersBefore = await q(
        `select 1 from outbound_emails where envelope_id = $1 and kind = 'reminder'`,
        [envelopeId],
      );
      const approved = await decide(token, page, 'approve');
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({ state: 'done', decided: true });
      const reminders = await q(
        `select 1 from outbound_emails where envelope_id = $1 and kind = 'reminder'`,
        [envelopeId],
      );
      expect(reminders.rowCount).toBe((remindersBefore.rowCount ?? 0) + 1);

      // A second POST is one decision.
      const again = await decide(token, page, 'deny');
      expect(again.body).toMatchObject({ state: 'done', decided: false });
      expect((await open(token)).card.state).toBe('done');

      const decided = await q<{ metadata: Record<string, unknown>; ip: string | null }>(
        `select metadata, ip from envelope_events where envelope_id = $1 and event_type = 'approval_decided'`,
        [envelopeId],
      );
      expect(decided.rows).toHaveLength(1);
      expect(decided.rows[0]?.metadata).toMatchObject({
        approval_id: pending.approval_id,
        decision: 'approved',
        decided_via: 'email',
        signed_in: false,
        user_agent: 'MailApp/1',
        key_id: keyA.id,
        key_name: 'Key 2',
      });
      expect(JSON.stringify(decided.rows)).not.toContain(token);
      expect(JSON.stringify(decided.rows)).not.toContain('/approve');

      // The audit chain still verifies with the new row in it (rule S.6).
      expect(await app.get(EnvelopesRepository).verifyEventChain(envelopeId)).toEqual({
        chain_intact: true,
      });
    });

    it('a check that fails at decision time (the hourly remind limit) is Failed with its slug; nothing sent', async () => {
      const pending = await ask('envelope_remind', {
        envelope_id: envelopeId,
        signer_id: signerId,
      });
      const { token } = await mailedToken();
      const page = await open(token);
      const before = await q(
        `select 1 from outbound_emails where envelope_id = $1 and kind = 'reminder'`,
        [envelopeId],
      );
      const res = await decide(token, page, 'approve');
      expect(res.body).toMatchObject({
        state: 'failed',
        result_slug: 'remind_throttled',
        decided: true,
      });
      const after = await q(
        `select 1 from outbound_emails where envelope_id = $1 and kind = 'reminder'`,
        [envelopeId],
      );
      expect(after.rowCount).toBe(before.rowCount);
      const status = await http().get(`/approvals/${pending.approval_id}`).set(bearer(fresh));
      expect(status.body).toMatchObject({ status: 'failed', result_slug: 'remind_throttled' });
    });

    it('the agent polls approvals_get / approvals_list: status only, no token, no review path', async () => {
      const pending = await ask('envelope_remind', {
        envelope_id: envelopeId,
        signer_id: signerId,
      });
      const client = await connect(keyA.token);
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining(['approvals_get', 'approvals_list']));
      const got = (await client.callTool({
        name: 'approvals_get',
        arguments: { approval_id: pending.approval_id },
      })) as CallToolResult;
      expect(got.structuredContent).toEqual({ status: 'pending' });
      const listed = (await client.callTool({
        name: 'approvals_list',
        arguments: { status: 'pending' },
      })) as CallToolResult;
      const serialized = JSON.stringify(listed);
      expect(serialized).toContain(pending.approval_id);
      expect(serialized).not.toMatch(/review|approve#|csrf/);
      expect(findTokenShapedStrings(serialized)).toEqual([]);
      // Another owner's key sees nothing.
      const other = await connect(keyB.token);
      const foreign = (await other.callTool({
        name: 'approvals_get',
        arguments: { approval_id: pending.approval_id },
      })) as CallToolResult;
      expect(foreign.isError).toBe(true);
      expect(JSON.stringify(foreign.content)).toContain('approval_not_found');
    });
  });

  describe('new recipient: Approve needs a session', () => {
    it('email says "Sign in to approve" → review_url; the link answers session_required; in-app needs amr within 12h', async () => {
      const d = await draft([{ name: 'Nia', email: 'nia@new.test' }]);
      const pending = await ask('envelope_send', { envelope_id: d.id });
      expect(pending.approve_requires).toBe('session');
      expect(pending.summary.recipients).toEqual([
        { name: 'Nia', email: 'nia@new.test', is_new: true },
      ]);
      const { token, mail } = await mailedToken();
      expect(mail.html).toContain(`href="${APP_URL}/approve/${pending.approval_id}/review"`);
      expect(mail.html).toContain('>Sign in to approve</a>');
      expect(mail.html).not.toContain('>Review fields</a>');

      const page = await open(token);
      expect(page.card).toMatchObject({ state: 'pending', approve_requires: 'session' });
      const linkApprove = await decide(token, page, 'approve');
      expect(linkApprove.status).toBe(403);
      expect(linkApprove.body).toEqual({ error: 'session_required' });

      const staleApprove = await http()
        .post(`/approvals/${pending.approval_id}/approve`)
        .set(bearer(stale));
      expect(staleApprove.status).toBe(403);
      expect(staleApprove.body).toEqual({ error: 'fresh_login_required' });

      // Another account gets 404, not 403.
      expect(
        (await http().get(`/approvals/${pending.approval_id}`).set(bearer(sessionB))).status,
      ).toBe(404);

      const ok = await http().post(`/approvals/${pending.approval_id}/approve`).set(bearer(fresh));
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ status: 'done', result: { status: 'awaiting_others' } });
      const env = await q<{ status: string }>(`select status from envelopes where id = $1`, [d.id]);
      expect(env.rows[0]?.status).toBe('awaiting_others');

      // `approval_decided` precedes every `sent` row of the send.
      const events = await q<{ event_type: string }>(
        `select event_type::text from envelope_events where envelope_id = $1 order by created_at, id`,
        [d.id],
      );
      const types = events.rows.map((r) => r.event_type);
      expect(types.indexOf('approval_decided')).toBeGreaterThanOrEqual(0);
      expect(types.indexOf('approval_decided')).toBeLessThan(types.indexOf('sent'));

      // The email link cannot decide again.
      expect((await decide(token, page, 'deny')).body).toMatchObject({
        state: 'done',
        decided: false,
      });

      // Nia was sent after an owner approval: now known, so the next ask is login-free.
      const d2 = await draft([{ name: 'Nia', email: 'nia@new.test' }]);
      expect((await ask('envelope_send', { envelope_id: d2.id })).approve_requires).toBe('link');
    });
  });

  describe('Deny', () => {
    it('never needs a session, mails the owner, and a repeat visit shows Denied', async () => {
      const d = await draft([{ name: 'Zed', email: 'zed@new.test' }]);
      const pending = await ask('envelope_send', { envelope_id: d.id });
      const { token } = await mailedToken();
      const page = await open(token);
      const denied = await decide(token, page, 'deny');
      expect(denied.body).toMatchObject({ state: 'denied', decided: true });
      const env = await q<{ status: string }>(`select status from envelopes where id = $1`, [d.id]);
      expect(env.rows[0]?.status).toBe('draft');
      const mails = await flush();
      expect(mails.map((m) => m.subject)).toContain('You denied Key 2');
      expect((await open(token)).card.state).toBe('denied');
      const list = await http().get('/approvals?status=denied').set(bearer(fresh));
      expect(list.status).toBe(200);
      expect(list.body.items.map((i: { id: string }) => i.id)).toContain(pending.approval_id);
    });

    it('in-app Deny needs a session but no fresh sign-in', async () => {
      const d = await draft([{ name: 'Ada', email: 'ada@acme.test' }]);
      const pending = await ask('envelope_send', { envelope_id: d.id });
      const res = await http().post(`/approvals/${pending.approval_id}/deny`).set(bearer(stale));
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('denied');
    });
  });

  describe('Expired', () => {
    it('an agent edit after the request, with no new preview, expires the link', async () => {
      const d = await draft([{ name: 'Ada', email: 'ada@acme.test' }]);
      await ask('envelope_send', { envelope_id: d.id });
      const { token } = await mailedToken();
      const page = await open(token);
      await placeFields(d.id, d.signerIds, 0.4);
      const res = await decide(token, page, 'approve');
      expect(res.body).toMatchObject({ state: 'expired', decided: false });
      const env = await q<{ status: string }>(`select status from envelopes where id = $1`, [d.id]);
      expect(env.rows[0]?.status).toBe('draft');
    });

    it('a link past 24 hours is Expired, and the next ask opens a new approval', async () => {
      const d = await draft([{ name: 'Ada', email: 'ada@acme.test' }]);
      const first = await ask('envelope_send', { envelope_id: d.id });
      const { token } = await mailedToken();
      const page = await open(token);
      await q(`update mcp_approvals set expires_at = now() - interval '1 minute' where id = $1`, [
        first.approval_id,
      ]);
      expect((await decide(token, page, 'approve')).body).toMatchObject({
        state: 'expired',
        decided: false,
      });
      expect((await open(token)).card.state).toBe('expired');
      const next = await ask('envelope_send', { envelope_id: d.id });
      expect(next.approval_id).not.toBe(first.approval_id);
    });

    it('revoking the key expires its pending approvals', async () => {
      const key = await insertKey(ownerA, ['envelopes:read', 'envelopes:send'], 'Key 9');
      const d = await draft([{ name: 'Ada', email: 'ada@acme.test' }]);
      await ask('envelope_send', { envelope_id: d.id }, key.id);
      const { token } = await mailedToken();
      expect((await open(token)).card.state).toBe('pending');
      const revoked = await http().post(`/me/api-keys/${key.id}/revoke`).set(bearer(fresh));
      expect(revoked.status).toBe(200);
      expect((await open(token)).card.state).toBe('expired');
      const row = await q<{ expired_reason: string }>(
        `select expired_reason from mcp_approvals where api_key_id = $1`,
        [key.id],
      );
      expect(row.rows.map((r) => r.expired_reason)).toEqual(['api_key_revoked']);
    });
  });

  describe('re-mint', () => {
    it('an agent re-preview keeps the id, mails a new link, and the old one reads "Updated" and never decides', async () => {
      const d = await draft([{ name: 'Ada', email: 'ada@acme.test' }]);
      const first = await ask('envelope_send', { envelope_id: d.id });
      const oldLink = await mailedToken();
      const oldPage = await open(oldLink.token);
      await placeFields(d.id, d.signerIds, 0.3);
      const again = await ask('envelope_send', { envelope_id: d.id });
      expect(again.approval_id).toBe(first.approval_id);
      const newLink = await mailedToken();
      expect(newLink.token).not.toBe(oldLink.token);
      expect((await open(oldLink.token)).card.state).toBe('superseded');
      const stale = await decide(oldLink.token, oldPage, 'approve');
      expect(stale.body).toMatchObject({ state: 'superseded', decided: false });
      const page = await open(newLink.token);
      expect((await decide(newLink.token, page, 'approve')).body).toMatchObject({
        state: 'done',
        decided: true,
      });
    });

    it('an owner edit from Review re-mints; the previous link stays pending ("Fields updated"); a second edit expires the first', async () => {
      const d = await draft([{ name: 'Ada', email: 'ada@acme.test' }]);
      const pending = await ask('envelope_send', { envelope_id: d.id });
      const link1 = await mailedToken();

      await placeFields(d.id, d.signerIds, 0.25);
      const edited = await http()
        .post(`/approvals/${pending.approval_id}/refresh`)
        .set(bearer(fresh));
      expect(edited.status).toBe(200);
      expect(edited.body).toMatchObject({ id: pending.approval_id, status: 'pending' });
      expect(edited.body.fields_updated_at).toEqual(expect.any(String));
      const link2 = await mailedToken();
      expect(link2.mail.html).toContain('Fields updated');
      const alias = await open(link1.token);
      expect(alias.card).toMatchObject({ state: 'pending' });
      expect(alias.card.fields_updated_at).toEqual(expect.any(String));

      await placeFields(d.id, d.signerIds, 0.35);
      await http().post(`/approvals/${pending.approval_id}/refresh`).set(bearer(fresh));
      const link3 = await mailedToken();
      expect((await open(link1.token)).card.state).toBe('expired');
      expect((await open(link3.token)).card.state).toBe('pending');
      const viaAlias = await open(link2.token);
      expect(viaAlias.card.state).toBe('pending');
      expect((await decide(link2.token, viaAlias, 'approve')).body).toMatchObject({
        state: 'done',
        decided: true,
      });
    });
  });

  describe('cancel needs a session', () => {
    it('even when every recipient is known; Deny stays login-free', async () => {
      const d = await draft([{ name: 'Ada', email: 'ada@acme.test' }]);
      expect((await http().post(`/envelopes/${d.id}/send`).set(bearer(fresh))).status).toBe(201);
      await flush();
      const pending = await ask('envelope_cancel', { envelope_id: d.id });
      expect(pending.approve_requires).toBe('session');
      const { token } = await mailedToken();
      const page = await open(token);
      expect((await decide(token, page, 'approve')).body).toEqual({ error: 'session_required' });
      expect((await decide(token, page, 'deny')).body).toMatchObject({ state: 'denied' });
      const env = await q<{ status: string }>(`select status from envelopes where id = $1`, [d.id]);
      expect(env.rows[0]?.status).toBe('awaiting_others');
    });
  });

  describe('guards on the request hook', () => {
    it('refuses an account whose email is not verified, and a stub kind, writing nothing', async () => {
      const before = await q(`select count(*)::int as n from mcp_approvals`);
      await expect(
        svc.request({
          requester: { ownerId: ownerB, apiKeyId: keyB.id },
          kind: 'envelope_send',
          args: { envelope_id: randomUUID() },
        }),
      ).rejects.toThrow('email_not_verified');
      await expect(ask('account_delete', {})).rejects.toThrow('approval_kind_not_ready');
      const after = await q(`select count(*)::int as n from mcp_approvals`);
      expect(after.rows[0]).toEqual(before.rows[0]);
    });
  });

  describe('migration 0030 down → up', () => {
    it('rolls back cleanly, keeps the other enum labels, and the up script applies again', async () => {
      const down = readFileSync(resolve(MIGRATIONS, 'down/0030_mcp_approvals_down.sql'), 'utf8');
      await q(down);
      const gone = await q<{ t: string | null }>(
        `select to_regclass('public.mcp_approvals')::text as t`,
      );
      expect(gone.rows[0]?.t).toBeNull();
      const events = await q<{ l: string }>(
        `select unnest(enum_range(null::event_type))::text as l`,
      );
      expect(events.rows.map((r) => r.l)).not.toContain('approval_decided');
      expect(events.rows.map((r) => r.l)).toContain('access_code_failed');
      const kinds = await q<{ l: string }>(
        `select unnest(enum_range(null::email_kind))::text as l`,
      );
      expect(kinds.rows.map((r) => r.l)).not.toContain('approval_request');
      expect(kinds.rows.map((r) => r.l)).toContain('api_key_created');
      const col = await q(
        `select 1 from information_schema.columns where table_name = 'api_keys' and column_name = 'approval_notify'`,
      );
      expect(col.rowCount).toBe(0);
      // Idempotent: a second down is a no-op.
      await q(down);
      await q(readFileSync(resolve(MIGRATIONS, '0030_mcp_approvals.sql'), 'utf8'));
      const back = await q<{ t: string | null }>(
        `select to_regclass('public.mcp_approvals')::text as t`,
      );
      expect(back.rows[0]?.t).toBe('mcp_approvals');
    });
  });

  describe('concurrent Approve vs Deny', () => {
    it('over HTTP: exactly one decision wins, every time', async () => {
      for (let round = 0; round < 4; round += 1) {
        const d = await draft([{ name: 'Ada', email: 'ada@acme.test' }]);
        const pending = await ask('envelope_send', { envelope_id: d.id });
        const { token } = await mailedToken();
        const page = await open(token);
        const results = await Promise.all([
          decide(token, page, 'approve'),
          decide(token, page, 'deny'),
          decide(token, page, 'approve'),
          decide(token, page, 'deny'),
        ]);
        const winners = results.filter((r) => r.body.decided === true);
        expect(winners).toHaveLength(1);
        const row = await q<{ approved_at: Date | null; denied_at: Date | null }>(
          `select approved_at, denied_at from mcp_approvals where id = $1`,
          [pending.approval_id],
        );
        const r = row.rows[0]!;
        expect((r.approved_at === null) !== (r.denied_at === null)).toBe(true);
        const decidedEvents = await q(
          `select 1 from envelope_events where envelope_id = $1 and event_type = 'approval_decided'`,
          [d.id],
        );
        expect(decidedEvents.rowCount).toBe(1);
        const sends = await q(
          `select 1 from envelope_events where envelope_id = $1 and event_type = 'sent'`,
          [d.id],
        );
        expect(sends.rowCount).toBe(r.approved_at ? 1 : 0);
      }
    });

    it('in the repository: 20 racing conditional updates, one row changes', async () => {
      const repo = app.get(ApprovalsRepository);
      const d = await draft([{ name: 'Ada', email: 'ada@acme.test' }]);
      const pending = await ask('envelope_send', { envelope_id: d.id });
      const row = await repo.findById(pending.approval_id);
      if (!row) throw new Error('no row');
      const now = new Date();
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          repo.claimDecision({
            id: row.id,
            decision: i % 2 === 0 ? 'approve' : 'deny',
            tokenHash: null,
            ownerId: ownerA,
            via: 'app',
            ip: null,
            userAgent: null,
            signedIn: true,
            subjectHash: row.subjectHash,
            now,
          }),
        ),
      );
      expect(results.filter((r) => r !== null)).toHaveLength(1);
    });

    it('in-app Approve racing an email Deny: one wins', async () => {
      const d = await draft([{ name: 'Ada', email: 'ada@acme.test' }]);
      const pending = await ask('envelope_send', { envelope_id: d.id });
      const { token } = await mailedToken();
      const page = await open(token);
      const [app1, mail1] = await Promise.all([
        http().post(`/approvals/${pending.approval_id}/approve`).set(bearer(fresh)),
        decide(token, page, 'deny'),
      ]);
      const appWon = app1.body.status === 'done';
      const mailWon = mail1.body.decided === true;
      expect(appWon !== mailWon).toBe(true);
    });
  });
});
