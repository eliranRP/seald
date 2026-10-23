import { createHash } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { FEATURE_FLAGS, type FeatureFlag } from 'shared';
import { AccountDirectoryRepository } from '../src/accounts/account-directory.repository';
import { ApiKeysRepository } from '../src/api-keys/api-keys.repository';
import { AppModule } from '../src/app.module';
import { ApprovalsRepository } from '../src/approvals/approvals.repository';
import { SendGuardRepository } from '../src/approvals/send-guard.repository';
import { JWKS_RESOLVER } from '../src/auth/jwks.provider';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { APP_ENV } from '../src/config/config.module';
import type { AppEnv } from '../src/config/env.schema';
import { ContactsRepository } from '../src/contacts/contacts.repository';
import { PassthroughTransactionRunner, TransactionRunner } from '../src/db/transaction-runner';
import { OutboundEmailsRepository } from '../src/email/outbound-emails.repository';
import { EnvelopeDocumentsRepository } from '../src/envelopes/documents/envelope-documents.repository';
import { EnvelopesRepository } from '../src/envelopes/envelopes.repository';
import { IdempotencyRecordsRepository } from '../src/idempotency/idempotency-records.repository';
import { InMemoryIdempotencyRecordsRepository } from '../src/idempotency/__tests__/in-memory-idempotency-records.repository';
import { CimdFetcher } from '../src/mcp/oauth/cimd';
import { OAuthRepository } from '../src/mcp/oauth/oauth.repository';
import { StorageService } from '../src/storage/storage.service';
import { TemplatesRepository } from '../src/templates/templates.repository';
import { InMemoryApiKeysRepository } from './in-memory-api-keys-repository';
import { InMemoryApprovalsRepository } from './in-memory-approvals-repository';
import { InMemoryContactsRepository } from './in-memory-contacts-repository';
import { InMemoryEnvelopeDocumentsRepository } from './in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';
import { InMemoryOAuthRepository } from './in-memory-oauth-repository';
import { InMemoryOutboundEmailsRepository } from './in-memory-outbound-emails-repository';
import { InMemoryStorageService } from './in-memory-storage';
import { InMemoryTemplatesRepository } from './in-memory-templates-repository';
import { stubGdriveForEnvelopeDetail } from './stub-gdrive-for-envelope-detail';
import { buildTestJwks } from './test-jwks';

/**
 * MCP OAuth 2.1 (WP-27) end to end on the in-memory app: discovery from
 * a bare 401, the authorization code flow with PKCE through the consent
 * API, tokens on `/mcp` with the same scopes and owner approval as a key,
 * refresh rotation with reuse detection, revocation, connected apps, the
 * credential boundary, and both flags dark.
 */
const API = 'https://api.seald.test';
const RESOURCE = `${API}/mcp`;
const CLIENT_ID = 'claude-test';
const REDIRECT = 'https://claude.example/api/mcp/auth_callback';
const CIMD_ID = 'https://agent.example.org/oauth/client.json';
const CIMD_REDIRECT = 'https://agent.example.org/cb';

const TEST_ENV: AppEnv = {
  NODE_ENV: 'test',
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGIN: 'http://localhost:5173',
  APP_PUBLIC_URL: 'http://localhost:5173',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db?sslmode=disable',
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
  MCP_OAUTH_ISSUER: API,
  MCP_OAUTH_CLIENTS: JSON.stringify([
    { client_id: CLIENT_ID, client_name: 'Claude', redirect_uris: [REDIRECT] },
  ]),
};

const OWNER_A = '00000000-0000-0000-0000-00000000000a';
const OWNER_B = '00000000-0000-0000-0000-00000000000b';
const EMAIL_A = 'maya@example.com';
// Fake, low-entropy PKCE verifier: 43 characters of the unreserved set.
const VERIFIER = 'v'.repeat(43);
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;
const flags = (mcpServer: boolean, mcpOauth: boolean): void => {
  host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer, mcpOauth };
};

describe('MCP OAuth 2.1 (e2e, in-memory)', () => {
  let app: INestApplication;
  let oauth: InMemoryOAuthRepository;
  let approvals: InMemoryApprovalsRepository;
  let freshA: string;
  let staleA: string;
  let sessionB: string;
  let guest: string;
  let pdf: Buffer;
  const cimdFetches: string[] = [];

  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  let seq = 0;
  const idem = () => `wp27-key-${String((seq += 1)).padStart(6, '0')}`;

  const authorizeQuery = (over: Record<string, string> = {}) => ({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    scope: 'envelopes:read envelopes:write envelopes:send',
    state: 'xyz',
    resource: RESOURCE,
    ...over,
  });

  const rpc = (body: object, token?: string) => {
    let req = http()
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json');
    if (token !== undefined) req = req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };
  const callTool = (token: string, name: string, args: Record<string, unknown> = {}) =>
    rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, token);

  async function consent(
    session: string,
    over: Record<string, string> = {},
  ): Promise<{ code: string; redirect: URL }> {
    const res = await http()
      .post('/oauth/consent')
      .set(bearer(session))
      .send({ ...authorizeQuery(over), decision: 'approve' });
    expect(res.status).toBe(200);
    const redirect = new URL(res.body.redirect_to as string);
    return { code: redirect.searchParams.get('code') ?? '', redirect };
  }

  const tokenForm = (fields: Record<string, string>) =>
    http().post('/oauth/token').type('form').send(fields);

  async function tokensFor(session = freshA, over: Record<string, string> = {}) {
    const { code } = await consent(session, over);
    const res = await tokenForm({
      grant_type: 'authorization_code',
      code,
      redirect_uri: over.redirect_uri ?? REDIRECT,
      client_id: over.client_id ?? CLIENT_ID,
      code_verifier: VERIFIER,
      resource: RESOURCE,
    });
    expect(res.status).toBe(200);
    return res.body as { access_token: string; refresh_token: string; scope: string };
  }

  async function readyDraft(): Promise<string> {
    const env = await http().post('/envelopes').set(bearer(freshA)).send({ title: 'NDA' });
    expect(env.status).toBe(201);
    const id = env.body.id as string;
    const up = await http()
      .post(`/envelopes/${id}/upload`)
      .set(bearer(freshA))
      .attach('file', pdf, { filename: 'nda.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    const signer = await http()
      .post(`/envelopes/${id}/signers`)
      .set(bearer(freshA))
      .send({ name: 'Nia', email: 'nia@new.test' });
    expect(signer.status).toBe(201);
    const fields = await http()
      .put(`/envelopes/${id}/fields`)
      .set(bearer(freshA))
      .send({
        fields: [
          {
            signer_id: signer.body.id,
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.1,
            width: 0.2,
            height: 0.05,
            required: true,
          },
        ],
      });
    expect(fields.status).toBe(200);
    return id;
  }

  beforeAll(async () => {
    const tk = await buildTestJwks();
    const outbox = new InMemoryOutboundEmailsRepository();
    oauth = new InMemoryOAuthRepository();
    approvals = new InMemoryApprovalsRepository();
    approvals.grantSource = (id) => oauth.grantFacts(id);
    const envelopesRepo = new InMemoryEnvelopesRepository();
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    pdf = Buffer.from(await doc.save());

    // The real CIMD fetcher (URL checks, DNS pinning, address policy) with a
    // stub resolver and a stub HTTP client, so nothing leaves the machine.
    const cimd = new CimdFetcher(
      TEST_ENV,
      async () => [{ address: '93.184.216.34', family: 4 }],
      undefined,
      async (opts) => {
        const url = `https://${opts.target.hostname}${opts.target.path}`;
        cimdFetches.push(url);
        const body =
          url === CIMD_ID
            ? { client_id: CIMD_ID, client_name: 'Agent', redirect_uris: [CIMD_REDIRECT] }
            : null;
        return body
          ? {
              status: 200,
              contentType: 'application/json',
              truncated: false,
              body: Buffer.from(JSON.stringify(body)),
            }
          : { status: 404, contentType: 'text/plain', truncated: false, body: Buffer.alloc(0) };
      },
    );

    const moduleRef = await stubGdriveForEnvelopeDetail(
      Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(APP_ENV)
        .useValue(TEST_ENV)
        .overrideProvider(JWKS_RESOLVER)
        .useValue(tk.resolver)
        .overrideProvider(ApiKeysRepository)
        .useValue(new InMemoryApiKeysRepository(outbox))
        .overrideProvider(OutboundEmailsRepository)
        .useValue(outbox)
        .overrideProvider(EnvelopesRepository)
        .useValue(envelopesRepo)
        .overrideProvider(EnvelopeDocumentsRepository)
        .useValue(new InMemoryEnvelopeDocumentsRepository(envelopesRepo))
        .overrideProvider(ContactsRepository)
        .useValue(new InMemoryContactsRepository())
        .overrideProvider(TemplatesRepository)
        .useValue(new InMemoryTemplatesRepository())
        .overrideProvider(ApprovalsRepository)
        .useValue(approvals)
        .overrideProvider(IdempotencyRecordsRepository)
        .useValue(new InMemoryIdempotencyRecordsRepository())
        .overrideProvider(TransactionRunner)
        .useValue(new PassthroughTransactionRunner())
        .overrideProvider(SendGuardRepository)
        .useValue({
          lockOwner: async () => undefined,
          lockEnvelope: async () => undefined,
          usageSince: async () => ({ sends: 0, newRecipients: 0 }),
          deliveryHealthSince: async () => ({ sent: 0, bounced: 0, complaints: 0 }),
        })
        .overrideProvider(AccountDirectoryRepository)
        .useValue({ findEmail: async (id: string) => (id === OWNER_A ? EMAIL_A : null) })
        .overrideProvider(StorageService)
        .useValue(new InMemoryStorageService())
        .overrideProvider(OAuthRepository)
        .useValue(oauth)
        .overrideProvider(CimdFetcher)
        .useValue(cimd),
    ).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    approvals.mailboxes.set(OWNER_A, { email: EMAIL_A, verified: true });
    const opts = {
      issuer: `${TEST_ENV.SUPABASE_URL}/auth/v1`,
      audience: TEST_ENV.SUPABASE_JWT_AUDIENCE,
    };
    const nowS = Math.floor(Date.now() / 1000);
    freshA = await tk.sign(
      { sub: OWNER_A, email: EMAIL_A, amr: [{ method: 'password', timestamp: nowS - 30 }] },
      opts,
    );
    staleA = await tk.sign(
      { sub: OWNER_A, email: EMAIL_A, amr: [{ method: 'password', timestamp: nowS - 7200 }] },
      opts,
    );
    sessionB = await tk.sign(
      { sub: OWNER_B, email: 'b@example.com', amr: [{ method: 'password', timestamp: nowS }] },
      opts,
    );
    guest = await tk.sign(
      { sub: '00000000-0000-0000-0000-00000000000c', is_anonymous: true },
      opts,
    );
  });

  beforeEach(() => flags(true, true));
  afterAll(async () => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
    await app.close();
  });

  describe('dark by default', () => {
    it('mcpOauth defaults to false', () => {
      expect(FEATURE_FLAGS.mcpOauth).toBe(false);
    });

    it('with mcpOauth off every OAuth route 404s and /mcp answers exactly as before', async () => {
      flags(true, false);
      for (const path of [
        '/.well-known/oauth-protected-resource',
        '/.well-known/oauth-protected-resource/mcp',
        '/.well-known/oauth-authorization-server',
        '/oauth/authorize',
        '/me/connected-apps',
      ]) {
        expect((await http().get(path)).status).toBe(404);
      }
      expect((await http().post('/oauth/token').type('form').send({})).status).toBe(404);
      expect((await http().post('/oauth/revoke').type('form').send({})).status).toBe(404);
      expect((await http().post('/oauth/consent').set(bearer(freshA)).send({})).status).toBe(404);
      const bare = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      expect(bare.status).toBe(401);
      expect(bare.headers['www-authenticate']).toBeUndefined();
    });

    it('with mcpServer off the OAuth surface is dark too', async () => {
      flags(false, true);
      expect((await http().get('/.well-known/oauth-authorization-server')).status).toBe(404);
    });
  });

  describe('discovery', () => {
    it('a bare /mcp call points at the protected-resource metadata', async () => {
      const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toBe(
        `Bearer realm="seald", resource_metadata="${API}/.well-known/oauth-protected-resource"`,
      );
    });

    it('publishes resource and authorization-server metadata, with no registration endpoint', async () => {
      for (const path of [
        '/.well-known/oauth-protected-resource',
        '/.well-known/oauth-protected-resource/mcp',
      ]) {
        const prm = await http().get(path);
        expect(prm.status).toBe(200);
        expect(prm.body).toMatchObject({
          resource: RESOURCE,
          authorization_servers: [API],
          bearer_methods_supported: ['header'],
        });
        expect(prm.body.scopes_supported).toContain('envelopes:send');
      }
      const as = await http().get('/.well-known/oauth-authorization-server');
      expect(as.status).toBe(200);
      expect(as.body).toMatchObject({
        issuer: API,
        authorization_endpoint: `${API}/oauth/authorize`,
        token_endpoint: `${API}/oauth/token`,
        revocation_endpoint: `${API}/oauth/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        client_id_metadata_document_supported: true,
      });
      expect(as.body.registration_endpoint).toBeUndefined();
      expect((await http().post('/oauth/register').send({})).status).toBe(404);
    });
  });

  describe('the authorization code flow', () => {
    it('authorize → consent → token → /mcp, with PKCE, state and iss', async () => {
      const auth = await http().get('/oauth/authorize').query(authorizeQuery());
      expect(auth.status).toBe(302);
      const consentUrl = new URL(auth.headers.location as string);
      expect(`${consentUrl.origin}${consentUrl.pathname}`).toBe(
        'http://localhost:5173/oauth/mcp/consent',
      );
      expect(consentUrl.searchParams.get('client_id')).toBe(CLIENT_ID);
      const forwarded = Object.fromEntries(consentUrl.searchParams);

      const described = await http()
        .post('/oauth/consent/describe')
        .set(bearer(freshA))
        .send(forwarded);
      expect(described.status).toBe(200);
      expect(described.body).toEqual({
        client_name: 'Claude',
        redirect_host: 'claude.example',
        unverified: false,
        scopes: ['envelopes:read', 'envelopes:write', 'envelopes:send'],
        fresh_login_required: false,
      });

      const decided = await http()
        .post('/oauth/consent')
        .set(bearer(freshA))
        .send({ ...forwarded, decision: 'approve' });
      expect(decided.status).toBe(200);
      const back = new URL(decided.body.redirect_to as string);
      expect(`${back.origin}${back.pathname}`).toBe(REDIRECT);
      expect(back.searchParams.get('state')).toBe('xyz');
      expect(back.searchParams.get('iss')).toBe(API);
      const code = back.searchParams.get('code') ?? '';

      const tok = await tokenForm({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT,
        client_id: CLIENT_ID,
        code_verifier: VERIFIER,
        resource: RESOURCE,
      });
      expect(tok.status).toBe(200);
      expect(tok.headers['cache-control']).toBe('no-store');
      expect(tok.body).toMatchObject({
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'envelopes:read envelopes:write envelopes:send',
      });

      // The code is single use.
      const again = await tokenForm({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT,
        client_id: CLIENT_ID,
        code_verifier: VERIFIER,
        resource: RESOURCE,
      });
      expect(again.status).toBe(400);
      expect(again.body).toEqual({ error: 'invalid_grant' });
    });

    it('a wrong verifier, redirect or resource gets the RFC 6749 error, as JSON', async () => {
      const { code } = await consent(freshA);
      const bad = await http()
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT,
          client_id: CLIENT_ID,
          code_verifier: 'w'.repeat(43),
          resource: RESOURCE,
        });
      expect(bad.status).toBe(400);
      expect(bad.body).toEqual({ error: 'invalid_grant' });
      const unknownGrant = await tokenForm({ grant_type: 'password' });
      expect(unknownGrant.body).toEqual({ error: 'unsupported_grant_type' });
    });

    it('an unknown client or redirect never leaves Seald', async () => {
      const unknown = await http()
        .get('/oauth/authorize')
        .query(authorizeQuery({ redirect_uri: 'https://evil.example/cb' }));
      expect(unknown.status).toBe(302);
      const loc = new URL(unknown.headers.location as string);
      expect(loc.origin).toBe('http://localhost:5173');
      expect(loc.searchParams.get('error')).toBe('invalid_redirect_uri');
    });

    it('consent needs a Supabase session, an email account and, for send, a fresh sign-in', async () => {
      const body = { ...authorizeQuery(), decision: 'approve' };
      expect((await http().post('/oauth/consent').send(body)).status).toBe(401);
      expect((await http().post('/oauth/consent').set(bearer(guest)).send(body)).status).toBe(403);
      const stale = await http().post('/oauth/consent').set(bearer(staleA)).send(body);
      expect(stale.status).toBe(403);
      expect(stale.body.error).toBe('fresh_login_required');
      const readOnly = await http()
        .post('/oauth/consent')
        .set(bearer(staleA))
        .send({ ...body, scope: 'envelopes:read' });
      expect(readOnly.status).toBe(200);
    });

    it('a CIMD client: metadata fetched through the SSRF path, labelled unverified', async () => {
      const d = await http()
        .post('/oauth/consent/describe')
        .set(bearer(freshA))
        .send(authorizeQuery({ client_id: CIMD_ID, redirect_uri: CIMD_REDIRECT }));
      expect(d.status).toBe(200);
      expect(d.body).toMatchObject({
        client_name: 'Agent',
        unverified: true,
        redirect_host: 'agent.example.org',
      });
      expect(cimdFetches).toContain(CIMD_ID);
      const t = await tokensFor(freshA, {
        client_id: CIMD_ID,
        redirect_uri: CIMD_REDIRECT,
        scope: 'envelopes:read',
      });
      expect(t.scope).toBe('envelopes:read');
    });
  });

  describe('access tokens on /mcp', () => {
    it('runs tools as the owner, with the token scopes, and gates send on owner approval', async () => {
      const t = await tokensFor();
      const list = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, t.access_token);
      expect(list.status).toBe(200);
      expect(list.body.result.tools.length).toBeGreaterThan(0);

      const me = await callTool(t.access_token, 'me_get');
      expect(me.status).toBe(200);
      expect(me.body.result.structuredContent).toMatchObject({
        id: OWNER_A,
        email: EMAIL_A,
        scopes: ['envelopes:read', 'envelopes:write', 'envelopes:send'],
        require_owner_approval: true,
      });

      const noContacts = await callTool(t.access_token, 'contacts_list');
      expect(noContacts.body.result.isError).toBe(true);
      expect(noContacts.body.result.content[0].text).toContain('insufficient_scope');

      const id = await readyDraft();
      const sent = await callTool(t.access_token, 'envelopes_send', {
        envelope_id: id,
        idempotency_key: idem(),
        dry_run: false,
      });
      expect(sent.status).toBe(200);
      expect(sent.body.result.isError).toBeFalsy();
      expect(sent.body.result.structuredContent).toMatchObject({ status: 'approval_pending' });
      const row = approvals.rows.find((r) => r.envelopeId === id);
      expect(row).toMatchObject({ apiKeyId: null, oauthGrantId: oauth.grants[0]?.id });
      expect(row?.summary.key_name).toBe('Claude (connected app)');
    });

    it('the credential boundary: a token works only on /mcp', async () => {
      const t = await tokensFor();
      for (const [method, path] of [
        ['get', '/envelopes'],
        ['get', '/me/api-keys'],
        ['get', '/me/connected-apps'],
        ['get', '/api/v1/me'],
      ] as const) {
        const res = await http()[method](path).set(bearer(t.access_token));
        expect([401, 404]).toContain(res.status);
      }
      // And a Supabase JWT is not an MCP credential.
      expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, freshA)).status).toBe(401);
      // A refresh token is not an access token.
      const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, t.refresh_token);
      expect(r.status).toBe(401);
    });
  });

  describe('refresh, reuse and revocation', () => {
    it('rotates; replaying the old refresh token revokes the grant and its tokens', async () => {
      const t1 = await tokensFor();
      const r1 = await tokenForm({
        grant_type: 'refresh_token',
        refresh_token: t1.refresh_token,
        client_id: CLIENT_ID,
      });
      expect(r1.status).toBe(200);
      const t2 = r1.body as { access_token: string; refresh_token: string };
      expect(
        (await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, t2.access_token)).status,
      ).toBe(200);

      const replay = await tokenForm({
        grant_type: 'refresh_token',
        refresh_token: t1.refresh_token,
        client_id: CLIENT_ID,
      });
      expect(replay.status).toBe(400);
      expect(replay.body).toEqual({ error: 'invalid_grant' });
      const dead = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, t2.access_token);
      expect(dead.status).toBe(401);
      expect(dead.headers['www-authenticate']).toContain('error="invalid_token"');
      const apps = await http().get('/me/connected-apps').set(bearer(freshA));
      const names = (apps.body.items as Array<{ client_name: string }>).map((a) => a.client_name);
      expect(names).not.toContain('Claude');
    });

    it('/oauth/revoke always answers 200 and kills the token', async () => {
      const t = await tokensFor();
      const res = await http()
        .post('/oauth/revoke')
        .type('form')
        .send({ token: t.access_token, client_id: CLIENT_ID });
      expect(res.status).toBe(200);
      expect(
        (await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, t.access_token)).status,
      ).toBe(401);
      const unknown = await http().post('/oauth/revoke').type('form').send({ token: 'whatever' });
      expect(unknown.status).toBe(200);
    });

    it('connected apps: listed for the owner only, revoke stops the app at once', async () => {
      const t = await tokensFor();
      const list = await http().get('/me/connected-apps').set(bearer(freshA));
      expect(list.status).toBe(200);
      const claude = (list.body.items as Array<Record<string, unknown>>).filter(
        (a) => a.client_name === 'Claude',
      );
      expect(claude).toEqual([
        expect.objectContaining({ client_host: 'claude.example', unverified: false }),
      ]);
      expect(JSON.stringify(list.body)).not.toContain(t.access_token);
      const id = String(claude[0]?.id);
      expect((await http().get('/me/connected-apps').set(bearer(sessionB))).body.items).toEqual([]);
      expect(
        (await http().post(`/me/connected-apps/${id}/revoke`).set(bearer(sessionB))).status,
      ).toBe(404);
      expect(
        (await http().post(`/me/connected-apps/${id}/revoke`).set(bearer(freshA))).body,
      ).toEqual({
        revoked: true,
      });
      expect(
        (await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, t.access_token)).status,
      ).toBe(401);
    });
  });
});
