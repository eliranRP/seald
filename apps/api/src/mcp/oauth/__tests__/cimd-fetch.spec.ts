import { pinnedGet } from '../../../automations/ssrf/pinned-request';
import type { WebhookTarget } from '../../../automations/ssrf/webhook-target';
import {
  startReceiver,
  type TestReceiver,
} from '../../../automations/ssrf/__tests__/test-receiver';
import { CIMD_LIMITS, CimdFetcher, type PinnedGet } from '../cimd';
import { CIMD_CLIENT, cimdDoc, cimdServer, publicResolver, testEnv } from './oauth-fixtures';

/**
 * CIMD fetches go through the automations SSRF path: static URL checks,
 * one DNS answer checked against the address policy, then a pinned GET.
 * The HTTP client is stubbed so no test leaves the machine; the URL and
 * address checks are the real ones.
 */
describe('CimdFetcher (SSRF guard)', () => {
  function fetcher(
    resolver = publicResolver,
    docs: Record<string, unknown> = { [CIMD_CLIENT]: cimdDoc() },
  ): { cimd: CimdFetcher; fetched: string[] } {
    const server = cimdServer(docs);
    return {
      cimd: new CimdFetcher(testEnv(), resolver, undefined, server.http),
      fetched: server.fetched,
    };
  }

  it('fetches, validates and caches a document from a public address', async () => {
    const { cimd, fetched } = fetcher();
    const first = await cimd.fetch(CIMD_CLIENT, 1_000);
    expect(first).toEqual({
      ok: true,
      client: {
        clientId: CIMD_CLIENT,
        clientName: 'Agent Example',
        redirectUris: ['https://agent.example.org/callback'],
      },
    });
    await cimd.fetch(CIMD_CLIENT, 2_000);
    expect(fetched).toHaveLength(1);
    // After the TTL it fetches again.
    await cimd.fetch(CIMD_CLIENT, 1_000 + CIMD_LIMITS.cacheTtlMs + 1);
    expect(fetched).toHaveLength(2);
  });

  it.each([
    ['loopback', '127.0.0.1'],
    ['private 10/8', '10.1.2.3'],
    ['private 192.168/16', '192.168.0.10'],
    ['link-local metadata', '169.254.169.254'],
    ['IPv6 loopback', '::1'],
    ['IPv4-mapped loopback', '::ffff:127.0.0.1'],
  ])('blocks a name that resolves to %s and never connects', async (_label, address) => {
    const http = jest.fn<ReturnType<PinnedGet>, Parameters<PinnedGet>>();
    const cimd = new CimdFetcher(
      testEnv(),
      async () => [{ address, family: address.includes(':') ? 6 : 4 }],
      undefined,
      http,
    );
    expect(await cimd.fetch(CIMD_CLIENT)).toEqual({ ok: false, reason: 'cimd_blocked' });
    expect(http).not.toHaveBeenCalled();
  });

  it('blocks a mixed DNS answer (rebinding) and internal or Seald host names', async () => {
    const http = jest.fn<ReturnType<PinnedGet>, Parameters<PinnedGet>>();
    const mixed = new CimdFetcher(
      testEnv(),
      async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ],
      undefined,
      http,
    );
    expect(await mixed.fetch(CIMD_CLIENT)).toEqual({ ok: false, reason: 'cimd_blocked' });
    const plain = new CimdFetcher(testEnv(), publicResolver, undefined, http);
    for (const id of [
      'https://metadata.google.internal/c.json',
      'https://api.seald.test/c.json',
      'https://app.seald.test/c.json',
      'https://seald.nromomentum.com/c.json',
      'https://10.0.0.1/c.json',
      'https://agent.example.org:8443/c.json',
    ]) {
      expect((await plain.fetch(id)).ok).toBe(false);
    }
    expect(http).not.toHaveBeenCalled();
  });

  it('caches a failure briefly, then retries', async () => {
    const { cimd, fetched } = fetcher(publicResolver, {});
    expect(await cimd.fetch(CIMD_CLIENT, 0)).toEqual({ ok: false, reason: 'cimd_fetch_failed' });
    await cimd.fetch(CIMD_CLIENT, CIMD_LIMITS.failureTtlMs - 1);
    expect(fetched).toHaveLength(1);
    await cimd.fetch(CIMD_CLIENT, CIMD_LIMITS.failureTtlMs + 1);
    expect(fetched).toHaveLength(2);
  });

  it('refuses an oversized body, a non-JSON type, a redirect and a thrown connection', async () => {
    const answers: Array<Awaited<ReturnType<PinnedGet>> | Error> = [
      { status: 200, contentType: 'application/json', truncated: true, body: Buffer.from('{') },
      { status: 200, contentType: 'text/html', truncated: false, body: Buffer.from('{}') },
      { status: 302, contentType: null, truncated: false, body: Buffer.alloc(0) },
      new Error('webhook_connect_timeout'),
    ];
    const expected = [
      'cimd_fetch_failed',
      'cimd_invalid_document',
      'cimd_fetch_failed',
      'cimd_fetch_failed',
    ];
    for (const [i, answer] of answers.entries()) {
      const cimd = new CimdFetcher(testEnv(), publicResolver, undefined, async (opts) => {
        expect(opts.maxResponseBytes).toBe(CIMD_LIMITS.maxBytes);
        expect(opts.totalTimeoutMs).toBe(CIMD_LIMITS.totalTimeoutMs);
        if (answer instanceof Error) throw answer;
        return answer;
      });
      expect(await cimd.fetch(CIMD_CLIENT)).toEqual({ ok: false, reason: expected[i] });
    }
  });
});

describe('pinnedGet (shared SSRF HTTP path)', () => {
  let rx: TestReceiver;
  beforeEach(async () => {
    rx = await startReceiver();
  });
  afterEach(async () => {
    await rx.close();
  });

  const target = (port: number): WebhookTarget => ({
    protocol: 'http:',
    hostname: 'agent.receiver.test',
    hostIsIp: false,
    port,
    path: '/client.json',
    hostHeader: `agent.receiver.test:${port}`,
    address: '127.0.0.1',
    family: 4,
  });
  const LIMITS = { connectTimeoutMs: 2_000, totalTimeoutMs: 3_000, maxResponseBytes: 64 };

  it('GETs the pinned address with the original Host and returns the body', async () => {
    rx.setHandler((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"a":1}');
    });
    const res = await pinnedGet({
      target: target(rx.port),
      headers: { Accept: 'application/json' },
      ...LIMITS,
    });
    expect(res).toMatchObject({ status: 200, contentType: 'application/json', truncated: false });
    expect(res.body.toString()).toBe('{"a":1}');
    expect(rx.received[0]).toMatchObject({ method: 'GET', url: '/client.json' });
    expect(rx.received[0]?.headers.host).toBe(`agent.receiver.test:${rx.port}`);
    expect(rx.received[0]?.headers.cookie).toBeUndefined();
  });

  it('caps the body and does not follow redirects', async () => {
    rx.setHandler((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('x'.repeat(500));
    });
    const big = await pinnedGet({ target: target(rx.port), headers: {}, ...LIMITS });
    expect(big.truncated).toBe(true);
    expect(big.body.length).toBeLessThanOrEqual(64);

    rx.setHandler((_req, res) => {
      res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data' });
      res.end();
    });
    const moved = await pinnedGet({ target: target(rx.port), headers: {}, ...LIMITS });
    expect(moved.status).toBe(302);
    expect(rx.received).toHaveLength(2);
  });
});
