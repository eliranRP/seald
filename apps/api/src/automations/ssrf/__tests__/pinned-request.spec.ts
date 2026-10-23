import { createServer, type Server } from 'node:http';
import { createServer as createNetServer, type AddressInfo, type Socket } from 'node:net';
import { PinnedRequestError, parseRetryAfter, pinnedPost } from '../pinned-request';
import type { WebhookTarget } from '../webhook-target';
import { selfSignedCert, startReceiver, type TestReceiver } from './test-receiver';

function httpTarget(port: number, overrides: Partial<WebhookTarget> = {}): WebhookTarget {
  return {
    protocol: 'http:',
    hostname: 'hooks.receiver.test',
    hostIsIp: false,
    port,
    path: '/in?x=1',
    hostHeader: `hooks.receiver.test:${port}`,
    address: '127.0.0.1',
    family: 4,
    ...overrides,
  };
}

const LIMITS = { connectTimeoutMs: 2_000, totalTimeoutMs: 3_000, maxResponseBytes: 64 * 1024 };

describe('pinnedPost', () => {
  let rx: TestReceiver;

  beforeEach(async () => {
    rx = await startReceiver();
  });
  afterEach(async () => {
    await rx.close();
  });

  it('connects to the pinned address with the original Host and only the given headers', async () => {
    const res = await pinnedPost({
      target: httpTarget(rx.port),
      headers: { 'Content-Type': 'application/json', 'X-Probe': '1' },
      body: '{"a":1}',
      ...LIMITS,
    });
    expect(res).toEqual({ status: 200, truncated: false });
    expect(rx.received).toHaveLength(1);
    const got = rx.received[0]!;
    expect(got.method).toBe('POST');
    expect(got.url).toBe('/in?x=1');
    expect(got.rawBody).toBe('{"a":1}');
    expect(got.headers.host).toBe(`hooks.receiver.test:${rx.port}`);
    expect(got.headers['content-length']).toBe('7');
    // No ambient credentials or cookies, ever.
    expect(got.headers.cookie).toBeUndefined();
    expect(got.headers.authorization).toBeUndefined();
    expect(got.headers['proxy-authorization']).toBeUndefined();
  });

  it('never follows a redirect: the 3xx status comes back and the Location is not fetched', async () => {
    const other = await startReceiver();
    rx.setHandler((_r, res) => {
      res.writeHead(302, { Location: `http://127.0.0.1:${other.port}/stolen` });
      res.end();
    });
    try {
      const res = await pinnedPost({
        target: httpTarget(rx.port),
        headers: {},
        body: '{}',
        ...LIMITS,
      });
      expect(res.status).toBe(302);
      expect(other.received).toHaveLength(0);
    } finally {
      await other.close();
    }
  });

  it('reads at most the cap, then discards the rest', async () => {
    rx.setHandler((_r, res) => {
      res.writeHead(200);
      const chunk = Buffer.alloc(16 * 1024, 97);
      let sent = 0;
      const pump = (): void => {
        while (sent < 4 * 1024 * 1024) {
          sent += chunk.length;
          if (!res.write(chunk)) {
            res.once('drain', pump);
            return;
          }
        }
        res.end();
      };
      pump();
    });
    const res = await pinnedPost({
      target: httpTarget(rx.port),
      headers: {},
      body: '{}',
      ...LIMITS,
      maxResponseBytes: 1024,
    });
    expect(res).toEqual({ status: 200, truncated: true });
  });

  it('passes a usable Retry-After back', async () => {
    rx.setHandler((_r, res) => {
      res.writeHead(429, { 'Retry-After': '120' });
      res.end();
    });
    const res = await pinnedPost({
      target: httpTarget(rx.port),
      headers: {},
      body: '{}',
      ...LIMITS,
    });
    expect(res).toEqual({ status: 429, truncated: false, retryAfterMs: 120_000 });
  });

  it('aborts at the total timeout when the receiver never answers', async () => {
    rx.setHandler(() => undefined);
    await expect(
      pinnedPost({
        target: httpTarget(rx.port),
        headers: {},
        body: '{}',
        ...LIMITS,
        totalTimeoutMs: 150,
      }),
    ).rejects.toMatchObject({ slug: 'webhook_timeout' });
  });

  it('aborts at the connect timeout when the TLS handshake never completes', async () => {
    // A raw TCP listener that never speaks TLS: the socket connects, the
    // secure handshake never finishes, so the connect timer decides.
    const held: Socket[] = [];
    const silent = createNetServer((s) => {
      held.push(s);
    });
    await new Promise<void>((r) => silent.listen(0, '127.0.0.1', r));
    const port = (silent.address() as AddressInfo).port;
    try {
      const err = await pinnedPost({
        target: httpTarget(port, { protocol: 'https:' }),
        headers: {},
        body: '{}',
        ...LIMITS,
        connectTimeoutMs: 100,
      }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PinnedRequestError);
      expect(err).toMatchObject({ slug: 'webhook_connect_timeout' });
    } finally {
      for (const s of held) s.destroy();
      await new Promise<void>((r) => silent.close(() => r()));
    }
  });

  it('reports a refused connection as a connect failure', async () => {
    const closed: Server = createServer();
    await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((r) => closed.close(() => r()));
    await expect(
      pinnedPost({ target: httpTarget(port), headers: {}, body: '{}', ...LIMITS }),
    ).rejects.toMatchObject({ slug: 'webhook_connect_failed', code: 'ECONNREFUSED' });
  });
});

describe('pinnedPost over TLS (pinned IP, SNI = original hostname)', () => {
  const HOST = 'hooks.receiver.test';
  const tls = selfSignedCert(HOST);
  let rx: TestReceiver;

  beforeAll(async () => {
    rx = await startReceiver(tls);
  });
  afterAll(async () => {
    await rx.close();
  });

  function httpsTarget(hostname: string): WebhookTarget {
    return {
      protocol: 'https:',
      hostname,
      hostIsIp: false,
      port: rx.port,
      path: '/in',
      hostHeader: `${hostname}:${rx.port}`,
      address: '127.0.0.1',
      family: 4,
    };
  }

  it('sends SNI and Host for the hostname and verifies the certificate against it', async () => {
    const res = await pinnedPost({
      target: httpsTarget(HOST),
      headers: {},
      body: '{}',
      ...LIMITS,
      ca: tls.cert,
    });
    expect(res.status).toBe(200);
    const got = rx.received.at(-1)!;
    expect(got.servername).toBe(HOST);
    expect(got.headers.host).toBe(`${HOST}:${rx.port}`);
  });

  it('fails TLS when the certificate does not match the hostname', async () => {
    await expect(
      pinnedPost({
        target: httpsTarget('other.receiver.test'),
        headers: {},
        body: '{}',
        ...LIMITS,
        ca: tls.cert,
      }),
    ).rejects.toMatchObject({ slug: 'webhook_tls_failed' });
  });

  it('fails TLS against an untrusted certificate (no test CA)', async () => {
    await expect(
      pinnedPost({ target: httpsTarget(HOST), headers: {}, body: '{}', ...LIMITS }),
    ).rejects.toMatchObject({ slug: 'webhook_tls_failed' });
  });
});

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  it.each([
    ['30', 30_000],
    [' 5 ', 5_000],
    ['999999999', 6 * 60 * 60_000],
    ['Thu, 22 Oct 2026 12:01:00 GMT', 60_000],
    ['Thu, 22 Oct 2026 11:00:00 GMT', 0],
  ])('%p → %p', (value, ms) => {
    expect(parseRetryAfter(value, now)).toBe(ms);
  });
  it.each([undefined, '', 'soon'])('%p → undefined', (value) => {
    expect(parseRetryAfter(value, now)).toBeUndefined();
  });
});
