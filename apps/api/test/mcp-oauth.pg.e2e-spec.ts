import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { ApprovalSummary } from 'shared';
import type { Database } from '../db/schema';
import { ApprovalsLifecycleService } from '../src/approvals/approvals-lifecycle.service';
import { ApprovalsPgRepository } from '../src/approvals/approvals.repository.pg';
import type { AuthUser } from '../src/auth/auth-user';
import type { AppEnv } from '../src/config/env.schema';
import { CimdFetcher } from '../src/mcp/oauth/cimd';
import { ConnectedAppsService } from '../src/mcp/oauth/connected-apps.service';
import { OAuthAccessTokenService } from '../src/mcp/oauth/oauth-access-token.service';
import { OAuthAuthorizationService } from '../src/mcp/oauth/oauth-authorization.service';
import { OAuthClientResolver } from '../src/mcp/oauth/oauth-client-resolver';
import { buildMcpOAuthConfig } from '../src/mcp/oauth/oauth-config';
import { hashSecret } from '../src/mcp/oauth/oauth-secrets';
import {
  OAuthTokenService,
  TokenError,
  type TokenResponse,
} from '../src/mcp/oauth/oauth-token.service';
import { OAuthPgRepository } from '../src/mcp/oauth/oauth.repository.pg';

/**
 * Migration 0036 and the OAuth services on real Postgres: RLS on every
 * table, single-use codes under concurrency, refresh rotation with one
 * winner and reuse revoking the grant, grant-scoped approvals (cap,
 * expiry on revoke, denial count), the account-deletion cascade and the
 * down script.
 *
 * Its own scratch database on the server named by
 * SUBMIT_SIGNER_DATABASE_URL; skipped when unset locally, fails in CI
 * when unset.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
// Unique per run: suites from parallel jobs share one Postgres server.
const DB_NAME = `mcp_oauth_${randomBytes(4).toString('hex')}`;
const MIGRATIONS = resolve(__dirname, '../db/migrations');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the MCP OAuth pg spec');
}
const describePg = databaseUrl ? describe : describe.skip;

const API = 'https://api.seald.test';
const RESOURCE = `${API}/mcp`;
const CLIENT_ID = 'claude-test';
const REDIRECT = 'https://claude.example/api/mcp/auth_callback';
// Fake, low-entropy PKCE verifier.
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const TABLES = [
  'oauth_clients',
  'oauth_grants',
  'oauth_authorization_codes',
  'oauth_refresh_tokens',
  'oauth_access_tokens',
];

const env = {
  NODE_ENV: 'test',
  PORT: 0,
  APP_PUBLIC_URL: 'https://app.seald.test',
  SUPABASE_URL: 'https://example.supabase.co',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db',
  CORS_ORIGIN: 'https://app.seald.test',
  MCP_OAUTH_ISSUER: API,
  MCP_OAUTH_CLIENTS: JSON.stringify([
    { client_id: CLIENT_ID, client_name: 'Claude', redirect_uris: [REDIRECT] },
  ]),
} as AppEnv;

describePg('MCP OAuth (real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let dedicatedUrl = '';
  let db: Kysely<Database>;
  let repo: OAuthPgRepository;
  let approvalsRepo: ApprovalsPgRepository;
  let authz: OAuthAuthorizationService;
  let tokens: OAuthTokenService;
  let access: OAuthAccessTokenService;
  let apps: ConnectedAppsService;

  async function migrate(): Promise<void> {
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR: MIGRATIONS },
    });
  }

  async function newOwner(): Promise<AuthUser> {
    const id = randomUUID();
    await pool!.query('insert into auth.users (id) values ($1)', [id]);
    return {
      id,
      email: `${id.slice(0, 8)}@example.com`,
      provider: 'email',
      lastSignInAt: Math.floor(Date.now() / 1000) - 30,
    };
  }

  const request = (over: Record<string, string> = {}) => ({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    scope: 'envelopes:read envelopes:send',
    state: 's',
    resource: RESOURCE,
    ...over,
  });

  async function code(user: AuthUser): Promise<string> {
    const { redirect_to } = await authz.decide(user, { ...request(), decision: 'approve' });
    return new URL(redirect_to).searchParams.get('code') ?? '';
  }

  const exchangeParams = (c: string) => ({
    grant_type: 'authorization_code',
    code: c,
    redirect_uri: REDIRECT,
    client_id: CLIENT_ID,
    code_verifier: VERIFIER,
    resource: RESOURCE,
  });

  const refreshParams = (t: string) => ({
    grant_type: 'refresh_token',
    refresh_token: t,
    client_id: CLIENT_ID,
  });

  async function settle(p: Promise<TokenResponse>): Promise<TokenResponse | string> {
    try {
      return await p;
    } catch (err) {
      if (err instanceof TokenError) return err.code;
      throw err;
    }
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({ connectionString: dedicatedUrl, max: 20 });
    // The final `drop database … with (force)` may terminate a connection
    // the pool is still closing; that is expected teardown noise.
    pool.on('error', () => undefined);
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await migrate();
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    repo = new OAuthPgRepository(db);
    approvalsRepo = new ApprovalsPgRepository(db);
    const config = buildMcpOAuthConfig(env);
    const lifecycle = new ApprovalsLifecycleService(approvalsRepo);
    const cimd = new CimdFetcher(env, undefined, undefined, async () => {
      throw new Error('no network in this spec');
    });
    authz = new OAuthAuthorizationService(config, new OAuthClientResolver(config, cimd), repo);
    tokens = new OAuthTokenService(config, repo, lifecycle);
    access = new OAuthAccessTokenService(config, repo);
    apps = new ConnectedAppsService(config, repo, lifecycle);
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  it('creates the five tables with RLS on and no policies', async () => {
    for (const t of TABLES) {
      const rls = await pool!.query<{ relrowsecurity: boolean }>(
        `select relrowsecurity from pg_class where oid = $1::regclass`,
        [`public.${t}`],
      );
      expect({ t, rls: rls.rows[0]?.relrowsecurity }).toEqual({ t, rls: true });
      const policies = await pool!.query(`select 1 from pg_policies where tablename = $1`, [t]);
      expect(policies.rowCount).toBe(0);
    }
  });

  it('runs the full flow and stores only hashes', async () => {
    const user = await newOwner();
    const c = await code(user);
    const t = await tokens.token(exchangeParams(c));
    const p = await access.verify(t.access_token);
    expect(p).toMatchObject({
      ok: true,
      ownerId: user.id,
      scopes: ['envelopes:read', 'envelopes:send'],
    });
    const dump = JSON.stringify(
      (
        await pool!.query(
          `select row_to_json(x) from (select * from public.oauth_access_tokens
             union all select null, token_hash, grant_id, family_id, client_ref, scopes, resource, absolute_expires_at, null, null from public.oauth_refresh_tokens) x`,
        )
      ).rows,
    );
    expect(dump).not.toContain(t.access_token);
    expect(dump).not.toContain(t.refresh_token);
    expect(dump).toContain(hashSecret(t.access_token));
    const codes = await pool!.query(`select code_hash from public.oauth_authorization_codes`);
    expect(JSON.stringify(codes.rows)).not.toContain(c);
  });

  it('a code exchanged twice at once has exactly one winner', async () => {
    const user = await newOwner();
    const c = await code(user);
    const results = await Promise.all([1, 2, 3].map(() => settle(tokens.token(exchangeParams(c)))));
    const winners = results.filter((r) => typeof r !== 'string');
    expect(winners).toHaveLength(1);
    expect(results.filter((r) => r === 'invalid_grant')).toHaveLength(2);
  });

  it('concurrent refreshes of one token: one rotation wins, the rest is reuse and revokes the grant', async () => {
    const user = await newOwner();
    const t = await tokens.token(exchangeParams(await code(user)));
    const results = await Promise.all(
      [1, 2].map(() => settle(tokens.token(refreshParams(t.refresh_token)))),
    );
    expect(results.filter((r) => r === 'invalid_grant')).toHaveLength(1);
    const grant = await pool!.query<{ revoked_at: Date | null; revoked_reason: string | null }>(
      `select revoked_at, revoked_reason from public.oauth_grants where owner_id = $1`,
      [user.id],
    );
    expect(grant.rows[0]?.revoked_reason).toBe('refresh_token_reuse');
    const live = await pool!.query(
      `select 1 from public.oauth_access_tokens a join public.oauth_grants g on g.id = a.grant_id
        where g.owner_id = $1 and a.revoked_at is null`,
      [user.id],
    );
    expect(live.rowCount).toBe(0);
  });

  it('one live grant per owner and client; re-consent updates scopes in place', async () => {
    const user = await newOwner();
    await Promise.all([code(user), code(user), code(user)]);
    const grants = await pool!.query(`select id from public.oauth_grants where owner_id = $1`, [
      user.id,
    ]);
    expect(grants.rowCount).toBe(1);
    await authz.decide(user, { ...request({ scope: 'envelopes:read' }), decision: 'approve' });
    const after = await pool!.query<{ scopes: string[] }>(
      `select scopes from public.oauth_grants where owner_id = $1`,
      [user.id],
    );
    expect(after.rows).toEqual([{ scopes: ['envelopes:read'] }]);
  });

  it('approvals: grant facts, the open cap per grant, expiry on revoke, denial count', async () => {
    const user = await newOwner();
    const t = await tokens.token(exchangeParams(await code(user)));
    const p = await access.verify(t.access_token);
    if (!p.ok || !p.oauth) throw new Error('no principal');
    const grantId = p.oauth.grantId;

    const facts = await approvalsRepo.findGrantFacts(grantId);
    expect(facts).toMatchObject({
      credential: 'oauth',
      oauthClientId: p.oauth.clientId,
      id: grantId,
      ownerId: user.id,
      name: 'Claude (connected app)',
      revokedAt: null,
      alwaysRequireSignin: false,
      allowNewRecipients: false,
      approvalNotify: 'email',
    });

    const summary: ApprovalSummary = {
      kind: 'envelope_send',
      action_label: 'Send for signature',
      title: 'NDA',
      recipients: [],
      page_count: 1,
      key_name: 'Claude (connected app)',
      approver_email: user.email ?? '',
      destination: null,
    };
    const open = (subject: string) =>
      approvalsRepo.openOrRepreview({
        ownerId: user.id,
        apiKeyId: null,
        oauthGrantId: grantId,
        kind: 'envelope_send',
        tool: 'envelopes_send',
        subjectKey: subject,
        envelopeId: null,
        args: {},
        summary,
        subjectHash: 'a'.repeat(64),
        approveRequires: 'link',
        notify: 'none',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        now: new Date(),
        maxOpenPerKey: 2,
        maxMailsPerOwnerPerDay: 100,
        email: null,
      });
    expect((await open('envelope:1')).outcome).toBe('created');
    expect((await open('envelope:2')).outcome).toBe('created');
    expect((await open('envelope:3')).outcome).toBe('limit_open');
    const rows = await pool!.query<{ api_key_id: string | null; oauth_grant_id: string }>(
      `select api_key_id, oauth_grant_id from public.mcp_approvals where owner_id = $1`,
      [user.id],
    );
    expect(rows.rows.every((r) => r.api_key_id === null && r.oauth_grant_id === grantId)).toBe(
      true,
    );

    await pool!.query(
      `update public.mcp_approvals set denied_at = now() where owner_id = $1 and subject_key = 'envelope:1'`,
      [user.id],
    );
    expect(await approvalsRepo.countDenialsForGrant(grantId, new Date(Date.now() - 60_000))).toBe(
      1,
    );

    await apps.revoke(user, grantId);
    const expired = await pool!.query<{ expired_reason: string | null }>(
      `select expired_reason from public.mcp_approvals where owner_id = $1 and denied_at is null`,
      [user.id],
    );
    expect(expired.rows).toEqual([{ expired_reason: 'oauth_grant_revoked' }]);
    expect((await approvalsRepo.findGrantFacts(grantId))?.revokedAt).not.toBeNull();
    expect((await access.verify(t.access_token)).ok).toBe(false);
    // Revoked, not deleted.
    const kept = await pool!.query(`select 1 from public.oauth_grants where id = $1`, [grantId]);
    expect(kept.rowCount).toBe(1);
  });

  it('account deletion cascades every OAuth row of the owner', async () => {
    const user = await newOwner();
    await tokens.token(exchangeParams(await code(user)));
    await pool!.query('delete from auth.users where id = $1', [user.id]);
    for (const t of ['oauth_grants', 'oauth_authorization_codes']) {
      const left = await pool!.query(`select 1 from public.${t} where owner_id = $1`, [user.id]);
      expect({ t, n: left.rowCount }).toEqual({ t, n: 0 });
    }
    const orphanTokens = await pool!.query(
      `select 1 from public.oauth_access_tokens a
        where not exists (select 1 from public.oauth_grants g where g.id = a.grant_id)`,
    );
    expect(orphanTokens.rowCount).toBe(0);
  });

  it('the down script drops the tables and up re-applies (both idempotent)', async () => {
    const down = readFileSync(resolve(MIGRATIONS, 'down/0036_mcp_oauth_down.sql'), 'utf8');
    await pool!.query(down);
    const gone = await pool!.query(`select to_regclass('public.oauth_grants') as t`);
    expect(gone.rows[0]?.t).toBeNull();
    const ledger = await pool!.query(
      `select 1 from public.schema_migrations where filename = '0036_mcp_oauth.sql'`,
    );
    expect(ledger.rowCount).toBe(0);
    await pool!.query(down);
    await migrate();
    await migrate();
    const back = await pool!.query(`select to_regclass('public.oauth_grants') as t`);
    expect(back.rows[0]?.t).toBe('oauth_grants');
  });
});
