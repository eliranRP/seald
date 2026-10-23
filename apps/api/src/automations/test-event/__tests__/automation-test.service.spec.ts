import { HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { FeatureFlag } from 'shared';
import type { AppEnv } from '../../../config/env.schema';
import { FakeWebhookRepo } from '../../actions/webhook/__tests__/fake-webhook-repo';
import { WEBHOOK_PAYLOAD_VERSION } from '../../actions/webhook/webhook-payload';
import { verifySignatureHeader } from '../../actions/webhook/webhook-signature';
import { WebhookSecretsService } from '../../actions/webhook/webhook-secrets.service';
import {
  WEBHOOK_MAX_RESPONSE_BYTES,
  WEBHOOK_TOTAL_TIMEOUT_MS,
  WebhookActionExecutor,
  type PinnedPost,
} from '../../actions/webhook/webhook.executor';
import { PinnedRequestError, pinnedPost } from '../../ssrf/pinned-request';
import { startReceiver, type TestReceiver } from '../../ssrf/__tests__/test-receiver';
import type { ResolvedAddress, WebhookResolver } from '../../ssrf/webhook-target';
import { AutomationTestRateLimiter } from '../automation-test-rate-limiter';
import { AutomationTestService } from '../automation-test.service';
import { FakeAutomationTestRepo } from './fake-automation-test-repo';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const AUTO = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-10-22T12:00:00.000Z');
const RECEIVER_HOST = 'hooks.receiver.test';
const ALLOWANCE = { allowHttp: true, allowAnyPort: true, allowAddresses: ['127.0.0.1'] };

const ENV = {
  NODE_ENV: 'test',
  APP_PUBLIC_URL: 'https://seald.nromomentum.com',
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  DATABASE_URL: 'postgres://u:p@db.abcdefgh.supabase.co:5432/postgres',
  CORS_ORIGIN: 'https://seald.nromomentum.com',
  AUTOMATION_SECRETS_KEY: '0f'.repeat(32),
} as AppEnv;

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

function resolverTo(address: string): jest.Mock {
  return jest.fn<Promise<readonly ResolvedAddress[]>, [string]>(async () => [
    { address, family: 4 },
  ]);
}

async function slugOf(p: Promise<unknown>): Promise<{ status: number; slug: unknown }> {
  try {
    await p;
  } catch (err) {
    if (err instanceof HttpException) {
      const body = err.getResponse();
      const slug = typeof body === 'string' ? body : (body as { message?: unknown }).message;
      return { status: err.getStatus(), slug };
    }
    throw err;
  }
  throw new Error('expected a rejection');
}

describe('AutomationTestService (A2b)', () => {
  let rx: TestReceiver;
  let webhookRepo: FakeWebhookRepo;
  let secrets: WebhookSecretsService;
  let repo: FakeAutomationTestRepo;
  let limiter: AutomationTestRateLimiter;

  beforeEach(async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    rx = await startReceiver();
    webhookRepo = new FakeWebhookRepo();
    secrets = new WebhookSecretsService(webhookRepo.asRepo(), ENV, ALLOWANCE);
    repo = new FakeAutomationTestRepo();
    limiter = new AutomationTestRateLimiter();
    repo.addRecipe({ id: AUTO, ownerId: OWNER });
  });

  afterEach(async () => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
    await rx.close();
  });

  function service(
    opts: { resolver?: WebhookResolver; http?: PinnedPost; env?: AppEnv } = {},
  ): AutomationTestService {
    const env = opts.env ?? ENV;
    const executor = new WebhookActionExecutor(
      secrets,
      webhookRepo.asRepo(),
      env,
      opts.resolver ?? resolverTo('127.0.0.1'),
      ALLOWANCE,
      opts.http,
    );
    return new AutomationTestService(repo, secrets, executor, limiter, env);
  }

  async function withUrl(url = `http://${RECEIVER_HOST}:${rx.port}/hooks?k=1`): Promise<string> {
    return (await secrets.createSecrets(AUTO, url)).secret;
  }

  it('sends one signed automation.test event through the real webhook path and reports it', async () => {
    const secret = await withUrl();
    const out = await service().sendTest(OWNER, AUTO, NOW);

    expect(out).toEqual({
      ok: true,
      event_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      type: 'automation.test',
      response_status: 200,
      duration_ms: expect.any(Number),
      response_truncated: false,
      error: null,
      transient: false,
    });
    expect(rx.received).toHaveLength(1);
    const got = rx.received[0]!;
    expect(got.url).toBe('/hooks?k=1');
    expect(got.headers['user-agent']).toBe('Seald-Automations');
    expect(got.headers['seald-event-id']).toBe(out.event_id);
    expect(
      verifySignatureHeader({
        header: got.headers['seald-signature'] as string,
        rawBody: got.rawBody,
        secret,
        nowSeconds: Math.floor(NOW.getTime() / 1000),
      }),
    ).toEqual({ ok: true, timestamp: Math.floor(NOW.getTime() / 1000) });
    expect(JSON.parse(got.rawBody)).toEqual({
      version: WEBHOOK_PAYLOAD_VERSION,
      id: out.event_id,
      type: 'automation.test',
      test: true,
      created_at: NOW.toISOString(),
      data: { automation_id: AUTO, event_type: 'envelope.sealed' },
    });
    // No envelope data, no URL, nothing token-shaped.
    expect(got.rawBody).not.toMatch(/token|sign_url|access_token|verify_url|envelope_id/i);
    expect(got.rawBody).not.toContain(RECEIVER_HOST);
  });

  it('names the recipe trigger as data.event_type', async () => {
    repo.addRecipe({ id: AUTO, ownerId: OWNER, trigger: 'envelope_sent' });
    await withUrl();
    await service().sendTest(OWNER, AUTO, NOW);
    expect(JSON.parse(rx.received[0]!.rawBody).data.event_type).toBe('envelope.sent');
  });

  it('a recipe waiting on owner approval is recipe_not_approved and never touches the network', async () => {
    await withUrl();
    repo.addApproval(AUTO, false);
    const http = jest.fn<ReturnType<PinnedPost>, Parameters<PinnedPost>>();
    const resolver = resolverTo('127.0.0.1');
    const decrypt = jest.spyOn(secrets, 'decrypt');
    expect(await slugOf(service({ http, resolver }).sendTest(OWNER, AUTO, NOW))).toEqual({
      status: 409,
      slug: 'recipe_not_approved',
    });
    expect(http).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
    expect(decrypt).not.toHaveBeenCalled();
    expect(rx.received).toHaveLength(0);
  });

  it('a newer approved row makes the recipe testable; a later pending request blocks it again', async () => {
    await withUrl();
    repo.addApproval(AUTO, false);
    repo.addApproval(AUTO, true);
    expect((await service().sendTest(OWNER, AUTO, NOW)).ok).toBe(true);
    repo.addApproval(AUTO, false);
    expect((await slugOf(service().sendTest(OWNER, AUTO, NOW))).slug).toBe('recipe_not_approved');
  });

  it("another owner's recipe, an unknown id and a malformed id are all 404", async () => {
    await withUrl();
    await expect(service().sendTest(OTHER, AUTO, NOW)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service().sendTest(OWNER, '44444444-4444-4444-8444-444444444444', NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service().sendTest(OWNER, 'not-a-uuid', NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(rx.received).toHaveLength(0);
  });

  it('is 404 while the flag is off or the kill switch is set, before any lookup', async () => {
    await withUrl();
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: false };
    await expect(service().sendTest(OWNER, AUTO, NOW)).rejects.toBeInstanceOf(NotFoundException);
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    const killed = { ...ENV, AUTOMATIONS_DISABLED: true } as AppEnv;
    await expect(service({ env: killed }).sendTest(OWNER, AUTO, NOW)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.approvalChecks).toBe(0);
    expect(rx.received).toHaveLength(0);
  });

  it('a non-webhook recipe has no test event (409 action_not_testable)', async () => {
    repo.addRecipe({ id: AUTO, ownerId: OWNER, action: 'gdrive_upload' });
    expect(await slugOf(service().sendTest(OWNER, AUTO, NOW))).toEqual({
      status: 409,
      slug: 'action_not_testable',
    });
  });

  it('is 503 automation_secrets_not_configured without AUTOMATION_SECRETS_KEY', async () => {
    const env = { ...ENV, AUTOMATION_SECRETS_KEY: undefined } as AppEnv;
    secrets = new WebhookSecretsService(webhookRepo.asRepo(), env, ALLOWANCE);
    const err = await slugOf(service({ env }).sendTest(OWNER, AUTO, NOW));
    expect(err).toEqual({ status: 503, slug: 'automation_secrets_not_configured' });
    await expect(service({ env }).sendTest(OWNER, AUTO, NOW)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('a recipe without a stored URL reports webhook_not_configured without a request', async () => {
    const out = await service().sendTest(OWNER, AUTO, NOW);
    expect(out).toMatchObject({ ok: false, error: 'webhook_not_configured', transient: false });
    expect(rx.received).toHaveLength(0);
  });

  it('an SSRF-blocked destination (DNS answer in 10/8) is webhook_url_blocked and opens no socket', async () => {
    await withUrl('https://hooks.example.com/x');
    const http = jest.fn<ReturnType<PinnedPost>, Parameters<PinnedPost>>();
    const out = await service({ resolver: resolverTo('10.0.0.1'), http }).sendTest(
      OWNER,
      AUTO,
      NOW,
    );
    expect(out).toMatchObject({
      ok: false,
      error: 'webhook_url_blocked',
      response_status: null,
      transient: false,
    });
    expect(http).not.toHaveBeenCalled();
  });

  it('uses the production timeout and read cap, and reports a timeout as transient', async () => {
    await withUrl();
    const http = jest.fn<ReturnType<PinnedPost>, Parameters<PinnedPost>>(async () => {
      throw new PinnedRequestError('webhook_timeout');
    });
    const out = await service({ http }).sendTest(OWNER, AUTO, NOW);
    expect(out).toMatchObject({ ok: false, error: 'webhook_timeout', transient: true });
    expect(http).toHaveBeenCalledTimes(1);
    expect(http.mock.calls[0]![0]).toMatchObject({
      totalTimeoutMs: WEBHOOK_TOTAL_TIMEOUT_MS,
      maxResponseBytes: WEBHOOK_MAX_RESPONSE_BYTES,
    });
  });

  it('a hanging receiver hits the real total timeout', async () => {
    await withUrl();
    rx.setHandler(() => undefined); // never answers
    const http: PinnedPost = (opts) => pinnedPost({ ...opts, totalTimeoutMs: 200 });
    const out = await service({ http }).sendTest(OWNER, AUTO, NOW);
    expect(out).toMatchObject({ ok: false, error: 'webhook_timeout', transient: true });
    expect(out.duration_ms).toBeGreaterThanOrEqual(150);
  });

  it('reports a receiver 404 with its status, and a body over 64 KB as truncated', async () => {
    await withUrl();
    rx.setHandler((_r, res) => {
      res.writeHead(404);
      res.end('nope');
    });
    expect(await service().sendTest(OWNER, AUTO, NOW)).toMatchObject({
      ok: false,
      response_status: 404,
      error: 'http_404',
      transient: false,
      response_truncated: false,
    });
    rx.setHandler((_r, res) => {
      res.writeHead(200);
      res.end('x'.repeat(WEBHOOK_MAX_RESPONSE_BYTES + 4096));
    });
    expect(await service().sendTest(OWNER, AUTO, NOW)).toMatchObject({
      ok: true,
      response_status: 200,
      response_truncated: true,
    });
  });

  it('allows 5 tests per recipe per minute, then 429 with retryAfter; refusals do not count', async () => {
    await withUrl();
    repo.addApproval(AUTO, false);
    for (let i = 0; i < 6; i += 1) {
      expect((await slugOf(service().sendTest(OWNER, AUTO, NOW))).status).toBe(409);
    }
    repo.addApproval(AUTO, true);
    const svc = service();
    for (let i = 0; i < 5; i += 1) expect((await svc.sendTest(OWNER, AUTO, NOW)).ok).toBe(true);
    const err = await slugOf(svc.sendTest(OWNER, AUTO, NOW));
    expect(err).toEqual({ status: 429, slug: 'rate_limited' });
    expect(rx.received).toHaveLength(5);
    // The window resets after a minute.
    expect((await svc.sendTest(OWNER, AUTO, new Date(NOW.getTime() + 60_000))).ok).toBe(true);
  });

  it('is never a run: the test path does not touch run or job storage', async () => {
    await withUrl();
    const load = jest.spyOn(webhookRepo, 'loadEvent');
    await service().sendTest(OWNER, AUTO, NOW);
    expect(load).not.toHaveBeenCalled();
  });
});
