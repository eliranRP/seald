import { Logger } from '@nestjs/common';
import { AUTOMATION_MAX_ATTEMPTS } from 'shared';
import type { AppEnv } from '../../../../config/env.schema';
import type { ClaimedAutomationJob } from '../../../automations.repository.pg';
import { pinnedPost } from '../../../ssrf/pinned-request';
import { startReceiver, type TestReceiver } from '../../../ssrf/__tests__/test-receiver';
import type { ResolvedAddress, WebhookResolver } from '../../../ssrf/webhook-target';
import { WEBHOOK_PAYLOAD_VERSION } from '../webhook-payload';
import { verifySignatureHeader } from '../webhook-signature';
import { WebhookSecretsService, WebhookUrlRejectedError } from '../webhook-secrets.service';
import { WebhookActionExecutor, classifyStatus, type PinnedPost } from '../webhook.executor';
import { FakeWebhookRepo } from './fake-webhook-repo';

const AUTO = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-10-22T12:00:00.000Z');
const KEY_HEX = '0f'.repeat(32);
const RECEIVER_HOST = 'hooks.receiver.test';

const ENV = {
  NODE_ENV: 'test',
  APP_PUBLIC_URL: 'https://seald.nromomentum.com',
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  DATABASE_URL: 'postgres://u:p@db.abcdefgh.supabase.co:5432/postgres',
  CORS_ORIGIN: 'https://seald.nromomentum.com',
  AUTOMATION_SECRETS_KEY: KEY_HEX,
} as AppEnv;

const ALLOWANCE = { allowHttp: true, allowAnyPort: true, allowAddresses: ['127.0.0.1'] };

function job(overrides: Partial<ClaimedAutomationJob> = {}): ClaimedAutomationJob {
  return {
    job_id: 'job-1',
    run_id: '44444444-4444-4444-8444-444444444444',
    automation_id: AUTO,
    attempts: 1,
    max_attempts: AUTOMATION_MAX_ATTEMPTS,
    owner_id: 'owner-1',
    envelope_id: 'env-1',
    event_id: 'evt-1',
    signer_id: null,
    trigger: 'envelope_sealed',
    action: 'webhook',
    config: { payload_detail: 'ids', url_host: RECEIVER_HOST },
    ...overrides,
  };
}

function resolverTo(address: string, family: 4 | 6 = 4): jest.Mock {
  return jest.fn<Promise<readonly ResolvedAddress[]>, [string]>(async () => [{ address, family }]);
}

describe('WebhookActionExecutor', () => {
  let rx: TestReceiver;
  let repo: FakeWebhookRepo;
  let secrets: WebhookSecretsService;

  beforeEach(async () => {
    rx = await startReceiver();
    repo = new FakeWebhookRepo();
    secrets = new WebhookSecretsService(repo.asRepo(), ENV, ALLOWANCE);
  });
  afterEach(async () => {
    await rx.close();
    jest.restoreAllMocks();
  });

  function executor(
    resolver: WebhookResolver,
    opts: { env?: AppEnv; http?: PinnedPost; allowance?: typeof ALLOWANCE | undefined } = {},
  ): WebhookActionExecutor {
    return new WebhookActionExecutor(
      secrets,
      repo.asRepo(),
      opts.env ?? ENV,
      resolver,
      'allowance' in opts ? opts.allowance : ALLOWANCE,
      opts.http,
    );
  }

  it('POSTs a signed JSON body to the pinned address and reports done', async () => {
    const { secret } = await secrets.createSecrets(
      AUTO,
      `http://${RECEIVER_HOST}:${rx.port}/hooks/seald?k=1`,
    );
    const resolver = resolverTo('127.0.0.1');
    const out = await executor(resolver).execute(job(), NOW);
    expect(out).toEqual({ kind: 'done', responseStatus: 200 });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(rx.received).toHaveLength(1);
    const got = rx.received[0]!;
    expect(got.url).toBe('/hooks/seald?k=1');
    expect(got.headers.host).toBe(`${RECEIVER_HOST}:${rx.port}`);
    expect(got.headers['content-type']).toBe('application/json');
    expect(got.headers['user-agent']).toBe('Seald-Automations');
    expect(got.headers['seald-event-id']).toBe(job().run_id);
    expect(got.headers['seald-signature-previous']).toBeUndefined();
    expect(
      verifySignatureHeader({
        header: got.headers['seald-signature'] as string,
        rawBody: got.rawBody,
        secret,
        nowSeconds: Math.floor(NOW.getTime() / 1000),
      }),
    ).toEqual({ ok: true, timestamp: Math.floor(NOW.getTime() / 1000) });
    const body = JSON.parse(got.rawBody) as Record<string, unknown>;
    expect(body).toMatchObject({
      version: WEBHOOK_PAYLOAD_VERSION,
      id: job().run_id,
      type: 'envelope.sealed',
      data: {
        envelope_id: 'env-1',
        status: 'completed',
        verify_url: 'https://seald.nromomentum.com/verify/AB12CD34EF56G',
      },
    });
    expect(got.rawBody).not.toContain(RECEIVER_HOST);
  });

  it('during rotation sends both signatures; after the window only the current one', async () => {
    await secrets.createSecrets(AUTO, `http://${RECEIVER_HOST}:${rx.port}/in`);
    const old = (await repo.getSecrets(AUTO))!;
    const { secret: fresh, previousRetiresAt } = await secrets.rotateSecret(AUTO, NOW);
    expect((await repo.getSecrets(AUTO))!.previous).toEqual(old.secret);

    await executor(resolverTo('127.0.0.1')).execute(job(), NOW);
    const during = rx.received[0]!;
    expect(during.headers['seald-signature-previous']).toBeDefined();
    const t = Math.floor(NOW.getTime() / 1000);
    expect(
      verifySignatureHeader({
        header: during.headers['seald-signature'] as string,
        rawBody: during.rawBody,
        secret: fresh,
        nowSeconds: t,
      }).ok,
    ).toBe(true);

    const after = new Date(previousRetiresAt.getTime() + 1000);
    await executor(resolverTo('127.0.0.1')).execute(job(), after);
    expect(rx.received[1]!.headers['seald-signature-previous']).toBeUndefined();
  });

  describe('SSRF: a blocked destination never opens a socket', () => {
    it.each([
      ['https://127.0.0.1/x', '127.0.0.1'],
      ['https://169.254.169.254/latest/meta-data/', '1.1.1.1'],
      ['https://[::ffff:127.0.0.1]/x', '1.1.1.1'],
      ['https://2130706433/x', '1.1.1.1'],
      ['https://internal.example.com/x', '192.168.0.5'],
      ['https://nat64.example.com/x', '64:ff9b::a00:1'],
      ['https://api.seald.nromomentum.com/x', '1.1.1.1'],
      ['https://abcdefgh.supabase.co/x', '1.1.1.1'],
      ['http://hooks.example.com/x', '1.1.1.1'],
    ])('%s → failed / webhook_url_blocked (permanent)', async (url, answer) => {
      await secrets.createSecrets(AUTO, 'https://hooks.example.com/ok').catch(() => undefined);
      // Bypass create-time validation to simulate a stored URL that has
      // since become dangerous (e.g. DNS changed).
      const box = (secrets as unknown as { box: import('../secret-box').SecretBox }).box;
      const { urlAad } = await import('../secret-box');
      await repo.replaceUrl(AUTO, box.seal(url, urlAad(AUTO)));
      const http = jest.fn<ReturnType<PinnedPost>, Parameters<PinnedPost>>();
      const out = await executor(resolverTo(answer, answer.includes(':') ? 6 : 4), {
        http,
        allowance: undefined,
      }).execute(job(), NOW);
      expect(out).toEqual({ kind: 'permanent', slug: 'webhook_url_blocked' });
      expect(http).not.toHaveBeenCalled();
    });

    it('the test allowance is ignored outside NODE_ENV=test', async () => {
      await secrets.createSecrets(AUTO, 'https://hooks.example.com/ok');
      const box = (secrets as unknown as { box: import('../secret-box').SecretBox }).box;
      const { urlAad } = await import('../secret-box');
      await repo.replaceUrl(AUTO, box.seal(`http://${RECEIVER_HOST}:${rx.port}/in`, urlAad(AUTO)));
      const out = await executor(resolverTo('127.0.0.1'), {
        env: { ...ENV, NODE_ENV: 'production' },
      }).execute(job(), NOW);
      expect(out).toEqual({ kind: 'permanent', slug: 'webhook_url_blocked' });
      expect(rx.received).toHaveLength(0);
    });
  });

  it('a 3xx is failed / webhook_redirect_blocked and the Location is not followed', async () => {
    const other = await startReceiver();
    rx.setHandler((_r, res) => {
      res.writeHead(307, { Location: `http://127.0.0.1:${other.port}/` });
      res.end();
    });
    try {
      await secrets.createSecrets(AUTO, `http://${RECEIVER_HOST}:${rx.port}/in`);
      const out = await executor(resolverTo('127.0.0.1')).execute(job(), NOW);
      expect(out).toEqual({
        kind: 'permanent',
        slug: 'webhook_redirect_blocked',
        responseStatus: 307,
      });
      expect(other.received).toHaveLength(0);
    } finally {
      await other.close();
    }
  });

  it('DNS failure is transient', async () => {
    await secrets.createSecrets(AUTO, 'https://hooks.example.com/in');
    const failing: WebhookResolver = async () => {
      throw Object.assign(new Error('x'), { code: 'EAI_AGAIN' });
    };
    expect(await executor(failing).execute(job(), NOW)).toEqual({
      kind: 'transient',
      slug: 'webhook_dns_failed',
    });
  });

  it('a refused connection is transient', async () => {
    await secrets.createSecrets(AUTO, `http://${RECEIVER_HOST}:${rx.port}/in`);
    await rx.close();
    const out = await executor(resolverTo('127.0.0.1')).execute(job(), NOW);
    expect(out).toEqual({ kind: 'transient', slug: 'webhook_connect_failed' });
    rx = await startReceiver();
  });

  it.each([
    [404, { kind: 'permanent', slug: 'http_404', responseStatus: 404 }],
    [410, { kind: 'permanent', slug: 'http_410', responseStatus: 410 }],
    [408, { kind: 'transient', slug: 'http_408', responseStatus: 408 }],
    [500, { kind: 'transient', slug: 'http_500', responseStatus: 500 }],
    [204, { kind: 'done', responseStatus: 204 }],
  ])('receiver status %i → %o', async (status, expected) => {
    rx.setHandler((_r, res) => {
      res.writeHead(status);
      res.end('upstream body with ada@example.com must never be stored');
    });
    await secrets.createSecrets(AUTO, `http://${RECEIVER_HOST}:${rx.port}/in`);
    expect(await executor(resolverTo('127.0.0.1')).execute(job(), NOW)).toEqual(expected);
  });

  it('classifyStatus honours Retry-After on 429 and 503', () => {
    expect(classifyStatus({ status: 429, truncated: false, retryAfterMs: 60_000 })).toEqual({
      kind: 'transient',
      slug: 'http_429',
      responseStatus: 429,
      retryAfterMs: 60_000,
    });
    expect(classifyStatus({ status: 503, truncated: false })).toEqual({
      kind: 'transient',
      slug: 'http_503',
      responseStatus: 503,
    });
    expect(classifyStatus({ status: 301, truncated: false })).toMatchObject({ kind: 'permanent' });
    expect(classifyStatus({ status: 401, truncated: false })).toMatchObject({ kind: 'permanent' });
  });

  it('missing secret row, missing key, a tampered row and a missing envelope are permanent', async () => {
    const http = jest.fn<ReturnType<PinnedPost>, Parameters<PinnedPost>>(pinnedPost);
    expect(await executor(resolverTo('1.1.1.1'), { http }).execute(job(), NOW)).toEqual({
      kind: 'permanent',
      slug: 'webhook_not_configured',
    });

    await secrets.createSecrets(AUTO, 'https://hooks.example.com/in');
    const keyless = new WebhookSecretsService(repo.asRepo(), {
      ...ENV,
      AUTOMATION_SECRETS_KEY: undefined,
    } as AppEnv);
    expect(keyless.isConfigured()).toBe(false);
    expect(
      await new WebhookActionExecutor(keyless, repo.asRepo(), ENV, resolverTo('1.1.1.1')).execute(
        job(),
        NOW,
      ),
    ).toEqual({ kind: 'permanent', slug: 'automation_secrets_not_configured' });

    const row = (await repo.getSecrets(AUTO))!;
    const flipped = Buffer.from(row.url.ciphertext);
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    repo.rows.set(AUTO, { ...row, url: { ...row.url, ciphertext: flipped } });
    expect(await executor(resolverTo('1.1.1.1'), { http }).execute(job(), NOW)).toEqual({
      kind: 'permanent',
      slug: 'webhook_secret_unreadable',
    });

    repo.rows.set(AUTO, row);
    repo.event = null;
    expect(await executor(resolverTo('1.1.1.1'), { http }).execute(job(), NOW)).toEqual({
      kind: 'permanent',
      slug: 'envelope_missing',
    });
    expect(http).not.toHaveBeenCalled();
  });

  it('logs only the run id, the outcome and the slug: no URL, host, body or secret', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    rx.setHandler((_r, res) => {
      res.writeHead(500);
      res.end('upstream-body-marker');
    });
    const { secret } = await secrets.createSecrets(
      AUTO,
      `http://${RECEIVER_HOST}:${rx.port}/path-marker?q=query-marker`,
    );
    await executor(resolverTo('127.0.0.1')).execute(job(), NOW);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]![0]);
    expect(line).toContain('http_500');
    for (const forbidden of [
      RECEIVER_HOST,
      'path-marker',
      'query-marker',
      'upstream-body-marker',
      secret,
    ]) {
      expect(line).not.toContain(forbidden);
    }
  });
});

describe('WebhookSecretsService', () => {
  const repo = new FakeWebhookRepo();
  const svc = new WebhookSecretsService(repo.asRepo(), ENV);

  it('generates the secret server side and stores only ciphertext', async () => {
    const url = 'https://hooks.example.com/in/very-secret-path?token=zzz';
    const { secret, urlHost } = await svc.createSecrets(AUTO, url);
    expect(urlHost).toBe('hooks.example.com');
    const row = (await repo.getSecrets(AUTO))!;
    for (const buf of [row.secret.ciphertext, row.url.ciphertext]) {
      expect(buf.includes(Buffer.from(secret))).toBe(false);
      expect(buf.includes(Buffer.from('very-secret-path'))).toBe(false);
      expect(buf.includes(Buffer.from('hooks.example.com'))).toBe(false);
    }
    expect(row.secret.nonce.equals(row.url.nonce)).toBe(false);
    const dec = await svc.decrypt(AUTO, NOW);
    expect(dec).toEqual({ url, secret, previousSecret: null });
  });

  it('rejects a bad URL at create time with a slug, never echoing the URL', async () => {
    const err: unknown = await svc.createSecrets(AUTO, 'https://user:pw@hooks.example.com/x').then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(WebhookUrlRejectedError);
    expect(err).toMatchObject({ slug: 'webhook_url_blocked', reason: 'userinfo' });
    expect((err as Error).message).not.toContain('hooks.example.com');
  });

  it('returns 503 slug when the key is unset', async () => {
    const keyless = new WebhookSecretsService(repo.asRepo(), {
      ...ENV,
      AUTOMATION_SECRETS_KEY: undefined,
    } as AppEnv);
    await expect(keyless.createSecrets(AUTO, 'https://hooks.example.com/x')).rejects.toMatchObject({
      slug: 'automation_secrets_not_configured',
    });
  });

  it('rotation keeps the previous secret for 24 hours, then the daily pass clears it', async () => {
    const { secret: first } = await svc.createSecrets(AUTO, 'https://hooks.example.com/x');
    const { secret: second, previousRetiresAt } = await svc.rotateSecret(AUTO, NOW);
    expect(previousRetiresAt.getTime() - NOW.getTime()).toBe(24 * 60 * 60_000);
    expect(await svc.decrypt(AUTO, NOW)).toMatchObject({ secret: second, previousSecret: first });
    const later = new Date(previousRetiresAt.getTime() + 1);
    expect((await svc.decrypt(AUTO, later)).previousSecret).toBeNull();
    expect(await svc.clearRetiredPrevious(later)).toBe(1);
    expect((await repo.getSecrets(AUTO))!.previous).toBeNull();
  });

  it('replacing the URL keeps the secret', async () => {
    const { secret } = await svc.createSecrets(AUTO, 'https://hooks.example.com/x');
    expect(await svc.replaceUrl(AUTO, 'https://other.example.com/y')).toBe('other.example.com');
    expect(await svc.decrypt(AUTO, NOW)).toMatchObject({
      url: 'https://other.example.com/y',
      secret,
    });
  });
});
