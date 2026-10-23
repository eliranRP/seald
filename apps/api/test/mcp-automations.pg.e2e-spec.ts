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
import request from 'supertest';
import type { ApiKeyScope, FeatureFlag } from 'shared';
import type { Database } from '../db/schema';
import { generateApiKey } from '../src/api-keys/api-key-secret';
import { AppModule } from '../src/app.module';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { AUTOMATION_ACTION_EXECUTORS } from '../src/automations/automation-actions';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { DB_TOKEN } from '../src/db/db.provider';
import { EmailSender, type EmailMessage, type EmailSendResult } from '../src/email/email-sender';
import { findTokenShapedStrings } from '../src/mcp/leak-scan';
import { StorageService } from '../src/storage/storage.service';
import { InMemoryStorageService } from './in-memory-storage';
import { buildTestJwks } from './test-jwks';

/**
 * MCP automation tools (WP-30, automations A3) end to end on real
 * Postgres, driven by the SDK `Client`: an internal recipe is on at once;
 * an external webhook is saved off and answers `approval_pending`, then
 * the owner approves in the app and it turns on; runs list, get and
 * retry; owner isolation; the default key has no automation scope.
 *
 * Its own scratch database on the server named by
 * SUBMIT_SIGNER_DATABASE_URL; skipped when unset locally, fails in CI
 * when unset.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `mcp_wp30_e2e_${randomBytes(4).toString('hex')}`;
const MIGRATIONS = resolve(__dirname, '../db/migrations');
const APP_URL = 'http://localhost:5173';
const HOOK_URL = 'https://hooks.example.com/seald/inbound?token=zzz';

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the MCP automations e2e');
}
const describePg = databaseUrl ? describe : describe.skip;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
const FLAGS: Partial<Record<FeatureFlag, boolean>> = {
  mcpServer: true,
  workflowAutomations: true,
};

class CapturingSender extends EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<EmailSendResult> {
    this.sent.push(msg);
    return { providerId: `prv_${this.sent.length}` };
  }
}

describePg('MCP automation tools (e2e, real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let app: INestApplication;
  let baseUrl: string;
  let sessionA: string;
  const storage = new InMemoryStorageService();
  const ownerA = randomUUID();
  const ownerB = randomUUID();
  const keys: Record<string, string> = {};
  const clients: Client[] = [];

  function q<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values: unknown[] = [],
  ) {
    if (!pool) throw new Error('pool not ready');
    return pool.query<T>(text, values);
  }

  async function insertKey(owner: string, scopes: ApiKeyScope[]): Promise<string> {
    const k = generateApiKey();
    await q(
      `insert into public.api_keys (owner_id, name, prefix, key_hash, scopes, expires_at)
       values ($1, $2, $3, $4, $5, now() + interval '30 days')`,
      [owner, `Key ${randomUUID().slice(0, 8)}`, k.prefix, k.keyHash, scopes],
    );
    return k.token;
  }

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'wp30-e2e', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport as Transport);
    clients.push(client);
    return client;
  }

  /** Every result is leak-scanned: a webhook secret or key shape never leaves. */
  async function call(
    client: Client,
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<CallToolResult> {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const serialized = JSON.stringify(result);
    expect({ name, leaks: findTokenShapedStrings(serialized) }).toEqual({ name, leaks: [] });
    expect(serialized).not.toContain('seald_webhook_');
    expect(serialized).not.toContain('token=zzz');
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
    return { idempotency_key: `e2e-key-${String(seq).padStart(6, '0')}`, dry_run: false, ...extra };
  };

  async function seedRun(
    automationId: string,
    owner: string,
    over: { status?: string; retryable?: boolean; last_error?: string | null } = {},
  ): Promise<string> {
    const row = await q<{ id: string }>(
      `insert into public.automation_runs
         (automation_id, owner_id, trigger, action, status, retryable, attempts, last_error, response_status, finished_at)
       values ($1, $2, 'envelope_sealed', 'webhook', $3::automation_run_status, $4, 8, $5, 503, now())
       returning id`,
      [
        automationId,
        owner,
        over.status ?? 'failed',
        over.retryable ?? true,
        over.last_error === undefined ? 'attempts_exhausted' : over.last_error,
      ],
    );
    return row.rows[0]!.id;
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1, application_name: 'wp30-e2e-admin' });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    const dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 4, application_name: 'wp30-e2e' });
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
      `insert into auth.users (id, email, email_confirmed_at) values ($1, $2, now()), ($3, $4, now())`,
      [ownerA, 'maya@example.com', ownerB, 'bea@example.com'],
    );
    // approvals_get (to poll an approval) needs envelopes:read, which every key keeps by default.
    keys['aWrite'] = await insertKey(ownerA, [
      'envelopes:read',
      'automations:read',
      'automations:write',
    ]);
    keys['aRead'] = await insertKey(ownerA, ['automations:read']);
    keys['aDefault'] = await insertKey(ownerA, ['envelopes:read']);
    keys['bWrite'] = await insertKey(ownerB, ['automations:read', 'automations:write']);

    const tk = await buildTestJwks();
    sessionA = await tk.sign(
      {
        sub: ownerA,
        email: 'maya@example.com',
        amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 60 }],
      },
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
      AUTOMATION_SECRETS_KEY: '1'.repeat(64),
      EMAIL_PROVIDER_DAILY_QUOTA: 100_000,
      EMAIL_PROVIDER_MONTHLY_QUOTA: 1_000_000,
    };
    host.__SEALD_FEATURE_OVERRIDES__ = FLAGS;
    // The email-copy executor ships with WP-33; a stand-in lets the internal
    // recipe path (own mailbox) be created here. The worker is off.
    const standIn = { execute: async () => ({ kind: 'done' as const }) };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(testEnv)
      .overrideProvider(JWKS_RESOLVER)
      .useValue(tk.resolver)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(EmailSender)
      .useValue(new CapturingSender())
      .overrideProvider(AUTOMATION_ACTION_EXECUTORS)
      .useValue({ webhook: standIn, email_copy: standIn })
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
    host.__SEALD_FEATURE_OVERRIDES__ = FLAGS;
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

  it('lists the automation tools only with both flags on', async () => {
    const client = await connect(keys['aWrite'] ?? '');
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'automations_list',
        'automations_upsert_recipe',
        'automations_set_enabled',
        'automations_list_runs',
        'automations_get_run',
        'automations_retry_run',
      ]),
    );
    expect(names).not.toContain('automations_test_webhook');
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, workflowAutomations: false };
    const off = (await client.listTools()).tools.map((t) => t.name);
    expect(off.filter((n) => n.startsWith('automations_'))).toEqual([]);
  });

  it('a default key (envelopes:read only) and a read-only key cannot write', async () => {
    const def = await connect(keys['aDefault'] ?? '');
    expect(errorOf(await call(def, 'automations_list')).slug).toBe('insufficient_scope');
    const read = await connect(keys['aRead'] ?? '');
    expect(ok(await call(read, 'automations_list'))).toMatchObject({ items: [] });
    expect(
      errorOf(
        await call(read, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' })),
      ).slug,
    ).toBe('insufficient_scope');
  });

  it('upserts an internal recipe: on at once, no approval', async () => {
    const client = await connect(keys['aWrite'] ?? '');
    const out = ok(
      await call(client, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' })),
    );
    expect(out).toMatchObject({
      status: 'saved',
      automation: { recipe: 'declined_notify_me', enabled: true, status_word: null },
    });
    const id = (out['automation'] as { id: string }).id;
    const row = await q<{ enabled: boolean; owner_id: string }>(
      `select enabled, owner_id from automations where id = $1`,
      [id],
    );
    expect(row.rows[0]).toEqual({ enabled: true, owner_id: ownerA });
    const approvals = await q(`select 1 from mcp_approvals where owner_id = $1`, [ownerA]);
    expect(approvals.rowCount).toBe(0);
  });

  it('upserts an external webhook: saved off, approval_pending, then the owner approves and it is on', async () => {
    const client = await connect(keys['aWrite'] ?? '');
    const out = ok(
      await call(
        client,
        'automations_upsert_recipe',
        write({ recipe: 'sealed_webhook', url: HOOK_URL, name: 'Sealed to CRM' }),
      ),
    );
    expect(out).toMatchObject({
      status: 'approval_pending',
      message: 'pending owner approval',
      approve_requires: 'link',
      summary: {
        kind: 'automation_external_destination',
        destination: { kind: 'webhook', label: 'hooks.example.com/seald/inbound' },
      },
      automation: {
        name: 'Sealed to CRM',
        enabled: false,
        status_word: 'Off',
        destination_host: 'hooks.example.com',
        awaiting_approval: true,
      },
    });
    const id = (out['automation'] as { id: string }).id;
    const approvalId = out['approval_id'] as string;
    // Review URL is the signed-in review, never a token link.
    expect(out['review_url']).toBe(`${APP_URL}/approve/${approvalId}/review`);

    // Off and not approved: the matcher selects only enabled recipes.
    const before = await q<{ enabled: boolean }>(`select enabled from automations where id = $1`, [
      id,
    ]);
    expect(before.rows[0]?.enabled).toBe(false);
    const pending = ok(await call(client, 'approvals_get', { approval_id: approvalId }));
    expect(pending['status']).toBe('pending');

    // The URL and secret are stored encrypted: no plaintext host in the row.
    const secrets = await q<{ url_ciphertext: Buffer; secret_ciphertext: Buffer }>(
      `select url_ciphertext, secret_ciphertext from automation_secrets where automation_id = $1`,
      [id],
    );
    expect(secrets.rowCount).toBe(1);
    expect(secrets.rows[0]?.url_ciphertext.toString('latin1')).not.toContain('hooks.example.com');
    const cfg = await q<{ config: Record<string, unknown> }>(
      `select config from automations where id = $1`,
      [id],
    );
    expect(cfg.rows[0]?.config).toEqual({ url_host: 'hooks.example.com', payload_detail: 'ids' });

    // The owner approves in the app (session JWT).
    const approve = await request(app.getHttpServer())
      .post(`/approvals/${approvalId}/approve`)
      .set({ Authorization: `Bearer ${sessionA}` });
    expect(approve.status).toBe(200);
    expect(approve.body).toMatchObject({ status: 'done' });

    const after = await q<{ enabled: boolean }>(`select enabled from automations where id = $1`, [
      id,
    ]);
    expect(after.rows[0]?.enabled).toBe(true);
    expect(ok(await call(client, 'approvals_get', { approval_id: approvalId }))['status']).toBe(
      'done',
    );
    const listed = ok(await call(client, 'automations_list'));
    expect(
      (listed['items'] as Array<{ id: string; enabled: boolean; awaiting_approval: boolean }>).find(
        (i) => i.id === id,
      ),
    ).toMatchObject({ enabled: true, awaiting_approval: false });
  });

  it('an edit to another URL turns the recipe off again; disabling is immediate, enabling asks again', async () => {
    const client = await connect(keys['aWrite'] ?? '');
    const created = ok(
      await call(
        client,
        'automations_upsert_recipe',
        write({ recipe: 'sent_webhook', url: HOOK_URL }),
      ),
    );
    const id = (created['automation'] as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/approvals/${created['approval_id'] as string}/approve`)
      .set({ Authorization: `Bearer ${sessionA}` })
      .expect(200);

    const moved = ok(
      await call(
        client,
        'automations_upsert_recipe',
        write({ automation_id: id, url: 'https://other.example.org/in' }),
      ),
    );
    expect(moved).toMatchObject({
      status: 'approval_pending',
      automation: { enabled: false, destination_host: 'other.example.org' },
    });
    // Same URL again: nothing new to approve.
    const again = ok(
      await call(
        client,
        'automations_upsert_recipe',
        write({ automation_id: id, url: 'https://other.example.org/in', name: 'Renamed' }),
      ),
    );
    expect(again).toMatchObject({
      status: 'saved',
      automation: { name: 'Renamed', enabled: false },
    });

    const off = ok(
      await call(client, 'automations_set_enabled', write({ automation_id: id, enabled: false })),
    );
    expect(off).toMatchObject({ status: 'saved', automation: { enabled: false } });
    const on = ok(
      await call(client, 'automations_set_enabled', write({ automation_id: id, enabled: true })),
    );
    expect(on).toMatchObject({ status: 'approval_pending', automation: { enabled: false } });
  });

  it('refuses a private address, a missing url and a dry run writes nothing', async () => {
    const client = await connect(keys['aWrite'] ?? '');
    const before = await q(`select 1 from automations where owner_id = $1`, [ownerA]);
    expect(
      errorOf(
        await call(
          client,
          'automations_upsert_recipe',
          write({ recipe: 'sealed_webhook', url: 'https://10.0.0.5/x' }),
        ),
      ).slug,
    ).toBe('webhook_url_blocked');
    expect(
      errorOf(await call(client, 'automations_upsert_recipe', write({ recipe: 'sealed_webhook' })))
        .slug,
    ).toBe('webhook_url_required');
    const dry = ok(
      await call(
        client,
        'automations_upsert_recipe',
        write({ recipe: 'sealed_webhook', url: HOOK_URL, dry_run: true }),
      ),
    );
    expect(dry).toMatchObject({ dry_run: true, would: { needs_approval: true } });
    const after = await q(`select 1 from automations where owner_id = $1`, [ownerA]);
    expect(after.rowCount).toBe(before.rowCount);
  });

  it('lists runs, gets one, and retries a retryable failure once; a permanent failure is refused', async () => {
    const client = await connect(keys['aWrite'] ?? '');
    const created = ok(
      await call(client, 'automations_upsert_recipe', write({ recipe: 'viewed_notify_me' })),
    );
    const id = (created['automation'] as { id: string }).id;
    const done = await seedRun(id, ownerA, { status: 'done', last_error: null });
    const retryable = await seedRun(id, ownerA);
    const permanent = await seedRun(id, ownerA, {
      retryable: false,
      last_error: 'webhook_url_blocked',
    });

    const runs = ok(await call(client, 'automations_list_runs', { automation_id: id }));
    const items = runs['items'] as Array<{ id: string; status_word: string | null }>;
    expect(items.map((i) => i.id).sort()).toEqual([done, retryable, permanent].sort());
    expect(items.find((i) => i.id === done)?.status_word).toBe('Done');
    const failedOnly = ok(
      await call(client, 'automations_list_runs', {
        automation_id: id,
        status: 'failed',
        limit: 1,
      }),
    );
    expect((failedOnly['items'] as unknown[]).length).toBe(1);
    expect(typeof failedOnly['next_cursor']).toBe('string');

    const one = ok(await call(client, 'automations_get_run', { run_id: retryable }));
    expect(one).toMatchObject({
      id: retryable,
      status_word: 'Failed',
      failure_slug: 'attempts_exhausted',
      retry_allowed: true,
    });
    const refused = ok(await call(client, 'automations_get_run', { run_id: permanent }));
    expect(refused).toMatchObject({ retry_allowed: false });

    const retry = ok(await call(client, 'automations_retry_run', write({ run_id: retryable })));
    expect(retry).toMatchObject({
      status: 'queued',
      run: { id: retryable, status: 'queued', retry_allowed: false },
    });
    const job = await q<{ status: string; attempts: number }>(
      `select status, attempts from automation_jobs where run_id = $1`,
      [retryable],
    );
    expect(job.rows).toEqual([{ status: 'pending', attempts: 0 }]);
    // A second tap is a no-op.
    expect(
      ok(await call(client, 'automations_retry_run', write({ run_id: retryable })))['status'],
    ).toBe('already_queued');
    expect((await q(`select 1 from automation_jobs where run_id = $1`, [retryable])).rowCount).toBe(
      1,
    );

    expect(
      errorOf(await call(client, 'automations_retry_run', write({ run_id: permanent }))).slug,
    ).toBe('retry_not_allowed');
    expect((await q(`select 1 from automation_jobs where run_id = $1`, [permanent])).rowCount).toBe(
      0,
    );
    expect(errorOf(await call(client, 'automations_retry_run', write({ run_id: done }))).slug).toBe(
      'retry_not_allowed',
    );

    // A retry cannot reach a recipe that is off.
    const another = await seedRun(id, ownerA);
    ok(await call(client, 'automations_set_enabled', write({ automation_id: id, enabled: false })));
    expect(
      errorOf(await call(client, 'automations_retry_run', write({ run_id: another }))).slug,
    ).toBe('automation_disabled');
  });

  it('is owner scoped end to end', async () => {
    const a = await connect(keys['aWrite'] ?? '');
    const b = await connect(keys['bWrite'] ?? '');
    const mine = ok(
      await call(a, 'automations_upsert_recipe', write({ recipe: 'expired_notify_me' })),
    );
    const id = (mine['automation'] as { id: string }).id;
    const run = await seedRun(id, ownerA);

    expect(ok(await call(b, 'automations_list'))).toMatchObject({ items: [] });
    expect(errorOf(await call(b, 'automations_get_run', { run_id: run })).slug).toBe(
      'automation_run_not_found',
    );
    expect(errorOf(await call(b, 'automations_retry_run', write({ run_id: run }))).slug).toBe(
      'automation_run_not_found',
    );
    expect(errorOf(await call(b, 'automations_list_runs', { automation_id: id })).slug).toBe(
      'automation_not_found',
    );
    expect(
      errorOf(
        await call(b, 'automations_set_enabled', write({ automation_id: id, enabled: false })),
      ).slug,
    ).toBe('automation_not_found');
    expect(
      errorOf(
        await call(b, 'automations_upsert_recipe', write({ automation_id: id, name: 'Taken' })),
      ).slug,
    ).toBe('automation_not_found');
    const row = await q<{ name: string; enabled: boolean }>(
      `select name, enabled from automations where id = $1`,
      [id],
    );
    expect(row.rows[0]?.name).not.toBe('Taken');
    expect(row.rows[0]?.enabled).toBe(true);
  });
});
