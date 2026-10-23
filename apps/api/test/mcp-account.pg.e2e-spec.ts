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
import sharp from 'sharp';
import request from 'supertest';
import { ESIGN_DISCLOSURE_VERSION, type ApiKeyScope, type FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
import { generateApiKey } from '../src/api-keys/api-key-secret';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { DB_TOKEN } from '../src/db/db.provider';
import { EmailSender, type EmailMessage, type EmailSendResult } from '../src/email/email-sender';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { findTokenShapedStrings } from '../src/mcp/leak-scan';
import { SupabaseAdminClient } from '../src/me/supabase-admin.client';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryStorageService } from './in-memory-storage';
import { StubSupabaseAdminClient } from './stub-supabase-admin';
import { buildTestJwks } from './test-jwks';

/**
 * WP-45 (parity plan D5) end to end on real Postgres, driven by the SDK
 * `Client`: account_export, api_keys_create / _list / _revoke,
 * approvals_set_required and envelopes_sign_as_signer, and account_delete
 * last. Each tool returns approval_pending and changes nothing until the
 * owner approves in the app with a sign-in from the last 10 minutes;
 * Deny and expiry change nothing; a key never mints a wider key; the new
 * key is only in the Approve response; the owner's own signature lands
 * as the signer with via=mcp_approval in an intact chain.
 *
 * Its own scratch database on the server named by
 * SUBMIT_SIGNER_DATABASE_URL; skipped when unset locally, fails in CI.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `mcp_account_e2e_${randomBytes(4).toString('hex')}`;
const MIGRATIONS = resolve(__dirname, '../db/migrations');
const APP_URL = 'http://localhost:5173';

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the MCP account e2e');
}
const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
const FLAGS: Partial<Record<FeatureFlag, boolean>> = { mcpServer: true };

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

describePg('MCP approval-gated account, key and owner-signing tools (WP-45, real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let app: INestApplication;
  let baseUrl: string;
  const storage = new InMemoryStorageService();
  const supabaseAdmin = new StubSupabaseAdminClient();
  const owner = randomUUID();
  const OWNER_EMAIL = 'maya@example.com';
  let fresh = '';
  let stale = '';
  let pdfBytes: Buffer;
  let signaturePng: string;
  const clients: Client[] = [];
  let adminKey: Key = { id: '', token: '' };
  let otherKey: Key = { id: '', token: '' };

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
      `insert into public.api_keys (owner_id, name, prefix, key_hash, scopes, expires_at)
       values ($1, $2, $3, $4, $5, now() + interval '30 days') returning id`,
      [owner, name, k.prefix, k.keyHash, scopes],
    );
    return { id: row.rows[0]!.id, token: k.token };
  }

  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'wp45-e2e', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport as Transport);
    clients.push(client);
    return client;
  }

  /** Every result is leak-scanned: no key, no token link, no signing token. */
  async function call(
    client: Client,
    name: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const serialized = JSON.stringify(result);
    expect({ name, leaks: findTokenShapedStrings(serialized) }).toEqual({ name, leaks: [] });
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
  const write = (extra: Record<string, unknown> = {}) => {
    seq += 1;
    return {
      idempotency_key: `wp45-e2e-${String(seq).padStart(6, '0')}`,
      dry_run: false,
      ...extra,
    };
  };
  const approve = (id: string, body?: Record<string, unknown>, jwt = fresh) =>
    http()
      .post(`/approvals/${id}/approve`)
      .set(bearer(jwt))
      .send(body ?? {});
  const deny = (id: string) => http().post(`/approvals/${id}/deny`).set(bearer(fresh)).send({});

  async function liveKeys(): Promise<Array<{ id: string; name: string; scopes: string[] }>> {
    const r = await q<{ id: string; name: string; scopes: string[] }>(
      `select id, name, scopes from api_keys where owner_id = $1 and revoked_at is null
        order by created_at`,
      [owner],
    );
    return r.rows;
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
    adminKey = await insertKey('Admin key', [
      'envelopes:read',
      'envelopes:write',
      'keys:admin',
      'account:admin',
      'envelopes:sign',
    ]);
    otherKey = await insertKey('Zapier', ['envelopes:read']);

    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    pdfBytes = Buffer.from(await doc.save());
    signaturePng = (
      await sharp({
        create: { width: 60, height: 20, channels: 3, background: { r: 255, g: 255, b: 255 } },
      })
        .png()
        .toBuffer()
    ).toString('base64');

    const tk = await buildTestJwks();
    const nowS = Math.floor(Date.now() / 1000);
    const sign = (amrAgo: number) =>
      tk.sign(
        {
          sub: owner,
          email: OWNER_EMAIL,
          amr: [{ method: 'password', timestamp: nowS - amrAgo }],
        },
        { issuer: 'https://example.supabase.co/auth/v1', audience: 'authenticated' },
      );
    fresh = await sign(60);
    // Inside the 12-hour window of a send approval, outside WP-45's 10 minutes.
    stale = await sign(60 * 60);

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
      .useValue(new CapturingSender())
      .overrideProvider(SupabaseAdminClient)
      .useValue(supabaseAdmin)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }, 180_000);

  beforeEach(() => {
    host.__SEALD_FEATURE_OVERRIDES__ = { ...FLAGS };
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

  it('lists the WP-45 tools', async () => {
    const client = await connect(adminKey.token);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'account_delete',
        'account_export',
        'api_keys_list',
        'api_keys_create',
        'api_keys_revoke',
        'approvals_set_required',
        'envelopes_sign_as_signer',
      ]),
    );
  });

  it('account_export: pending until a sign-in from the last 10 minutes approves it', async () => {
    const client = await connect(adminKey.token);
    const out = ok(await call(client, 'account_export', write()));
    expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
    const id = String(out['approval_id']);
    const tooOld = await approve(id, {}, stale);
    expect(tooOld.status).toBe(403);
    expect(tooOld.body).toMatchObject({ error: 'fresh_login_required' });
    expect(ok(await call(client, 'approvals_get', { approval_id: id }))).toEqual({
      status: 'pending',
    });
    const done = await approve(id);
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'done', result: { export_ready: true } });
  });

  describe('keys', () => {
    it('api_keys_create: a wider key is refused; Deny mints nothing; Approve shows the key once', async () => {
      const client = await connect(adminKey.token);
      expect(
        errorOf(await call(client, 'api_keys_create', write({ scopes: ['envelopes:send'] }))).slug,
      ).toBe('scope_exceeds_key');

      const before = await liveKeys();
      const first = ok(
        await call(
          client,
          'api_keys_create',
          write({ name: 'Denied key', scopes: ['envelopes:read'] }),
        ),
      );
      expect(await liveKeys()).toEqual(before);
      expect((await deny(String(first['approval_id']))).body).toMatchObject({ status: 'denied' });
      expect(await liveKeys()).toEqual(before);

      const second = ok(
        await call(
          client,
          'api_keys_create',
          write({ name: 'Approved key', scopes: ['envelopes:read', 'envelopes:write'] }),
        ),
      );
      expect(await liveKeys()).toEqual(before);
      const approved = await approve(String(second['approval_id']));
      expect(approved.status).toBe(200);
      const secret = String(approved.body.reveal?.api_key_secret);
      expect(secret).toMatch(/^seald_live_/);
      const keys = await liveKeys();
      expect(keys.map((k) => [k.name, k.scopes])).toContainEqual([
        'Approved key',
        ['envelopes:read', 'envelopes:write'],
      ]);
      // Not stored with the approval, not in a later read, not in approvals_get.
      const stored = await q<{ result: unknown }>(
        'select result from mcp_approvals where id = $1',
        [second['approval_id']],
      );
      expect(JSON.stringify(stored.rows[0]?.result)).not.toContain(secret);
      const later = await http()
        .get(`/approvals/${String(second['approval_id'])}`)
        .set(bearer(fresh));
      expect(JSON.stringify(later.body)).not.toContain(secret);
      // The minted key works.
      const minted = await connect(secret);
      expect(ok(await call(minted, 'me_get', {}))).toMatchObject({
        scopes: ['envelopes:read', 'envelopes:write'],
      });
      // And api_keys_list shows it without the secret or the literal prefix.
      const listed = ok(await call(client, 'api_keys_list', {}));
      expect((listed['items'] as Array<{ name: string }>).map((k) => k.name)).toContain(
        'Approved key',
      );
    });

    it('api_keys_revoke: the key works until the owner approves', async () => {
      const client = await connect(adminKey.token);
      const out = ok(await call(client, 'api_keys_revoke', write({ api_key_id: otherKey.id })));
      const zapier = await connect(otherKey.token);
      ok(await call(zapier, 'me_get', {}));
      const res = await approve(String(out['approval_id']));
      expect(res.body).toMatchObject({ status: 'done' });
      const row = await q<{ revoked_at: Date | null }>(
        'select revoked_at from api_keys where id = $1',
        [otherKey.id],
      );
      expect(row.rows[0]?.revoked_at).not.toBeNull();
    });

    it('approvals_set_required: off waits on the owner (expiry changes nothing); on applies at once', async () => {
      const client = await connect(adminKey.token);
      const flag = async () =>
        (
          await q<{ require_owner_approval: boolean }>(
            'select require_owner_approval from api_keys where id = $1',
            [adminKey.id],
          )
        ).rows[0]?.require_owner_approval;

      const off = ok(
        await call(client, 'approvals_set_required', write({ require_owner_approval: false })),
      );
      expect(off).toMatchObject({ status: 'approval_pending' });
      expect(await flag()).toBe(true);
      await q(`update mcp_approvals set expires_at = now() - interval '1 minute' where id = $1`, [
        off['approval_id'],
      ]);
      expect((await approve(String(off['approval_id']))).body).toMatchObject({ status: 'expired' });
      expect(await flag()).toBe(true);

      const again = ok(
        await call(client, 'approvals_set_required', write({ require_owner_approval: false })),
      );
      expect((await approve(String(again['approval_id']))).body).toMatchObject({ status: 'done' });
      expect(await flag()).toBe(false);

      const on = ok(
        await call(client, 'approvals_set_required', write({ require_owner_approval: true })),
      );
      expect(on).toEqual({
        status: 'applied',
        api_key_id: adminKey.id,
        require_owner_approval: true,
      });
      expect(await flag()).toBe(true);
    });
  });

  it('envelopes_sign_as_signer: the owner signs only on Approve, as the signer, via=mcp_approval', async () => {
    // A web-app envelope that lists the owner and Ada, sent from the app.
    const env = await http().post('/envelopes').set(bearer(fresh)).send({ title: 'Lease' });
    const id = env.body.id as string;
    await http()
      .post(`/envelopes/${id}/upload`)
      .set(bearer(fresh))
      .attach('file', pdfBytes, { filename: 'lease.pdf', contentType: 'application/pdf' })
      .expect(201);
    const me = await http()
      .post(`/envelopes/${id}/signers`)
      .set(bearer(fresh))
      .send({ name: 'Maya Owner', email: OWNER_EMAIL })
      .expect(201);
    const ada = await http()
      .post(`/envelopes/${id}/signers`)
      .set(bearer(fresh))
      .send({ name: 'Ada', email: 'ada@example.com' })
      .expect(201);
    await http()
      .put(`/envelopes/${id}/fields`)
      .set(bearer(fresh))
      .send({
        fields: [me.body.id, ada.body.id].map((signer_id: string, i) => ({
          signer_id,
          kind: 'signature',
          page: 1,
          x: 0.1,
          y: 0.1 + i * 0.2,
          width: 0.2,
          height: 0.05,
          required: true,
        })),
      })
      .expect(200);
    await http().post(`/envelopes/${id}/send`).set(bearer(fresh)).expect(201);

    const client = await connect(adminKey.token);
    expect(
      errorOf(
        await call(
          client,
          'envelopes_sign_as_signer',
          write({ envelope_id: id, signer_id: ada.body.id }),
        ),
      ).slug,
    ).toBe('signer_not_account_owner');
    const out = ok(await call(client, 'envelopes_sign_as_signer', write({ envelope_id: id })));
    expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
    const approvalId = String(out['approval_id']);
    const signedAt = async () =>
      (
        await q<{ signed_at: Date | null }>(
          'select signed_at from envelope_signers where id = $1',
          [me.body.id],
        )
      ).rows[0]?.signed_at;
    expect(await signedAt()).toBeNull();

    // No consent, no signature: refused, nothing recorded.
    const noConsent = await approve(approvalId, {});
    expect(noConsent.status).toBe(400);
    expect(noConsent.body).toMatchObject({ error: 'consent_required' });
    const noImage = await approve(approvalId, {
      esign_disclosure_version: ESIGN_DISCLOSURE_VERSION,
      record_access: true,
      intent_to_sign: true,
    });
    expect(noImage.body).toMatchObject({ error: 'signature_required' });
    expect(await signedAt()).toBeNull();

    const done = await approve(approvalId, {
      esign_disclosure_version: ESIGN_DISCLOSURE_VERSION,
      record_access: true,
      intent_to_sign: true,
      signature: { image_base64: signaturePng, format: 'typed', font: 'Caveat' },
    });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      status: 'done',
      result: { envelope_status: 'awaiting_others' },
    });
    expect(await signedAt()).not.toBeNull();

    const rows = await q<{
      event_type: string;
      actor_kind: string;
      signer_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `select event_type::text, actor_kind::text, signer_id, metadata from envelope_events
        where envelope_id = $1 order by created_at, id`,
      [id],
    );
    const mine = rows.rows.filter((r) => r.signer_id === me.body.id && r.actor_kind === 'signer');
    expect(mine.map((r) => r.event_type)).toEqual([
      'tc_accepted',
      'viewed',
      'esign_disclosure_acknowledged',
      'intent_to_sign_confirmed',
      'signed',
    ]);
    for (const r of mine) {
      expect(r.metadata).toMatchObject({ via: 'mcp_approval', approval_id: approvalId });
      expect(r.metadata).not.toHaveProperty('mcp');
    }
    const types = rows.rows.map((r) => r.event_type);
    expect(types.indexOf('approval_decided')).toBeLessThan(types.indexOf('signed'));
    // Ada is untouched.
    expect(rows.rows.some((r) => r.signer_id === ada.body.id && r.event_type === 'signed')).toBe(
      false,
    );
    expect(await app.get(EnvelopesRepository).verifyEventChain(id)).toMatchObject({
      chain_intact: true,
    });
  });

  it('account_delete (last): a wrong typed email records nothing; the right one deletes the account', async () => {
    const client = await connect(adminKey.token);
    const out = ok(await call(client, 'account_delete', write()));
    const id = String(out['approval_id']);
    const wrong = await approve(id, { confirm_email: 'someone@else.test' });
    expect(wrong.status).toBe(400);
    expect(wrong.body).toMatchObject({ error: 'confirmation_mismatch' });
    expect(supabaseAdmin.deletedUserIds).toEqual([]);
    expect((await liveKeys()).length).toBeGreaterThan(0);

    const done = await approve(id, { confirm_email: 'Maya@Example.com' });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'done', result: { deleted: true } });
    expect(supabaseAdmin.deletedUserIds).toEqual([owner]);
    const keys = await q('select 1 from api_keys where owner_id = $1', [owner]);
    expect(keys.rowCount).toBe(0);
    const approvals = await q('select 1 from mcp_approvals where owner_id = $1', [owner]);
    expect(approvals.rowCount).toBe(0);
  });
});
