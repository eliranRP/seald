import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import type { Socket } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { canonicalIp, parseIp } from './ip-policy';
import type { WebhookTarget } from './webhook-target';

/**
 * One POST to a pinned, pre-checked address (design doc § SSRF). Built on
 * `node:https` rather than `fetch` so every property is explicit:
 *
 * - The socket connects to `target.address` (an IP literal). There is no
 *   DNS lookup here, so the address checked is the address used.
 * - SNI (`servername`) and the `Host` header stay the original hostname,
 *   and TLS certificate verification runs against that hostname.
 * - Redirects are never followed (`node:http` does not follow them); the
 *   caller treats any 3xx as a permanent failure.
 * - A fresh agent per request (`agent: false`): no pooled sockets, no
 *   cookies, no proxy, no ambient credentials. Only the headers passed in
 *   are sent.
 * - Connect timeout, total timeout, and a response size cap. The body is
 *   read and discarded; only the status code comes back.
 */

export interface PinnedPostOptions {
  readonly target: WebhookTarget;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly connectTimeoutMs: number;
  readonly totalTimeoutMs: number;
  readonly maxResponseBytes: number;
  /** Test-only: extra TLS trust roots for a local HTTPS receiver. */
  readonly ca?: string | Buffer;
}

export interface PinnedPostResult {
  readonly status: number;
  /** `Retry-After` in milliseconds when the receiver sent a usable one. */
  readonly retryAfterMs?: number;
  /** True when the body exceeded the cap and the rest was discarded. */
  readonly truncated: boolean;
}

export class PinnedRequestError extends Error {
  constructor(
    readonly slug:
      | 'webhook_connect_timeout'
      | 'webhook_timeout'
      | 'webhook_connect_failed'
      | 'webhook_tls_failed'
      | 'webhook_address_mismatch',
    readonly code?: string,
  ) {
    super(slug);
    this.name = 'PinnedRequestError';
  }
}

const MAX_RETRY_AFTER_MS = 6 * 60 * 60_000;
const EMPTY = Buffer.alloc(0);

export function parseRetryAfter(
  value: string | string[] | undefined,
  nowMs: number,
): number | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  if (!v) return undefined;
  if (/^\d+$/.test(v.trim())) return Math.min(Number(v.trim()) * 1000, MAX_RETRY_AFTER_MS);
  const at = Date.parse(v);
  if (Number.isNaN(at)) return undefined;
  return Math.min(Math.max(0, at - nowMs), MAX_RETRY_AFTER_MS);
}

function isTlsError(code: string | undefined): boolean {
  if (!code) return false;
  return (
    code.startsWith('ERR_TLS') ||
    code.startsWith('ERR_SSL') ||
    code.includes('CERT') ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
  );
}

/**
 * `lookup` that never resolves: it answers with the pinned address only.
 * `host` is already an IP literal, so Node should not call it at all; this
 * is a guard in case a future Node version does (both callback shapes).
 */
function pinnedLookup(target: WebhookTarget): NonNullable<RequestOptions['lookup']> {
  return ((_hostname: string, options: { all?: boolean }, cb: PinnedLookupCallback) => {
    if (options.all) cb(null, [{ address: target.address, family: target.family }]);
    else cb(null, target.address, target.family);
  }) as NonNullable<RequestOptions['lookup']>;
}

type PinnedLookupCallback = (
  err: null,
  address: string | { address: string; family: number }[],
  family?: number,
) => void;

/** Byte-level comparison, so `::1` and `0:0:0:0:0:0:0:1` are equal. */
function sameAddress(remote: string | undefined, pinned: string): boolean {
  if (!remote) return false;
  // A dual-stack socket may report an IPv4 peer as `::ffff:a.b.c.d`.
  const a = parseIp(remote.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, ''));
  const b = parseIp(pinned);
  return a !== null && b !== null && canonicalIp(a) === canonicalIp(b);
}

export function pinnedPost(opts: PinnedPostOptions): Promise<PinnedPostResult> {
  return pinnedRequest({ ...opts, method: 'POST', collectBody: false }).then((r) => ({
    status: r.status,
    truncated: r.truncated,
    ...(r.retryAfterMs !== undefined ? { retryAfterMs: r.retryAfterMs } : {}),
  }));
}

export interface PinnedGetOptions {
  readonly target: WebhookTarget;
  readonly headers: Readonly<Record<string, string>>;
  readonly connectTimeoutMs: number;
  readonly totalTimeoutMs: number;
  /** Bodies larger than this are cut off and reported `truncated`. */
  readonly maxResponseBytes: number;
  /** Test-only: extra TLS trust roots for a local HTTPS server. */
  readonly ca?: string | Buffer;
}

export interface PinnedGetResult {
  readonly status: number;
  readonly contentType: string | null;
  /** True when the body exceeded the cap; `body` then holds only the first bytes. */
  readonly truncated: boolean;
  readonly body: Buffer;
}

/**
 * One GET to a pinned, pre-checked address with the same guarantees as
 * `pinnedPost` (no DNS here, no redirects, no pooled sockets, timeouts),
 * returning a size-capped body. Used for OAuth client metadata
 * documents (WP-27, CIMD).
 */
export function pinnedGet(opts: PinnedGetOptions): Promise<PinnedGetResult> {
  return pinnedRequest({ ...opts, method: 'GET', body: '', collectBody: true }).then((r) => ({
    status: r.status,
    contentType: r.contentType,
    truncated: r.truncated,
    body: r.body,
  }));
}

interface PinnedRequestOptions {
  readonly target: WebhookTarget;
  readonly method: 'GET' | 'POST';
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly collectBody: boolean;
  readonly connectTimeoutMs: number;
  readonly totalTimeoutMs: number;
  readonly maxResponseBytes: number;
  readonly ca?: string | Buffer;
}

interface PinnedRequestResult {
  readonly status: number;
  readonly retryAfterMs?: number;
  readonly contentType: string | null;
  readonly truncated: boolean;
  readonly body: Buffer;
}

function pinnedRequest(opts: PinnedRequestOptions): Promise<PinnedRequestResult> {
  const { target } = opts;
  return new Promise<PinnedRequestResult>((resolve, reject) => {
    let settled = false;
    let req: ClientRequest | undefined;
    const timers: NodeJS.Timeout[] = [];

    const settle = (outcome: { err: Error } | { result: PinnedRequestResult }): void => {
      if (settled) return;
      settled = true;
      for (const t of timers) clearTimeout(t);
      req?.destroy();
      if ('err' in outcome) reject(outcome.err);
      else resolve(outcome.result);
    };
    const fail = (err: Error): void => settle({ err });

    timers.push(
      setTimeout(() => fail(new PinnedRequestError('webhook_timeout')), opts.totalTimeoutMs),
    );
    const connectTimer = setTimeout(
      () => fail(new PinnedRequestError('webhook_connect_timeout')),
      opts.connectTimeoutMs,
    );
    timers.push(connectTimer);

    const headers: Record<string, string> = {
      ...opts.headers,
      Host: target.hostHeader,
      ...(opts.method === 'POST' ? { 'Content-Length': String(Buffer.byteLength(opts.body)) } : {}),
      Connection: 'close',
    };

    const base: RequestOptions = {
      host: target.address,
      family: target.family,
      port: target.port,
      path: target.path,
      method: opts.method,
      headers,
      agent: false,
      // Never resolve: `host` is already an IP literal. If anything asks
      // for a lookup anyway, answer with the pinned address only.
      lookup: pinnedLookup(target),
    };

    const onResponse = (res: IncomingMessage): void => {
      clearTimeout(connectTimer);
      const status = res.statusCode ?? 0;
      const retryAfterMs = parseRetryAfter(res.headers['retry-after'], Date.now());
      const contentType = res.headers['content-type'] ?? null;
      let seen = 0;
      let truncated = false;
      const chunks: Buffer[] = [];
      const done = (): void =>
        settle({
          result: {
            status,
            truncated,
            contentType,
            body: opts.collectBody
              ? Buffer.concat(chunks).subarray(0, opts.maxResponseBytes)
              : EMPTY,
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
          },
        });
      res.on('data', (chunk: Buffer) => {
        seen += chunk.length;
        if (opts.collectBody) chunks.push(chunk);
        if (seen > opts.maxResponseBytes) {
          truncated = true;
          done();
        }
      });
      res.on('end', done);
      res.on('aborted', done);
      res.on('error', done);
    };

    try {
      if (target.protocol === 'https:') {
        req = httpsRequest(
          {
            ...base,
            // SNI must be a hostname; an IP-literal URL sends none and the
            // certificate is checked against the IP.
            ...(target.hostIsIp ? {} : { servername: target.hostname }),
            rejectUnauthorized: true,
            ...(opts.ca ? { ca: opts.ca } : {}),
          },
          onResponse,
        );
      } else {
        req = httpRequest(base, onResponse);
      }
    } catch {
      fail(new PinnedRequestError('webhook_connect_failed'));
      return;
    }

    req.on('socket', (socket: Socket) => {
      const onConnected = (): void => {
        // Defence in depth: the peer must be the pinned address.
        if (!sameAddress(socket.remoteAddress, target.address)) {
          fail(new PinnedRequestError('webhook_address_mismatch'));
          return;
        }
        if (target.protocol === 'http:') clearTimeout(connectTimer);
      };
      socket.once('connect', onConnected);
      if (target.protocol === 'https:') {
        (socket as TLSSocket).once('secureConnect', () => clearTimeout(connectTimer));
      }
    });

    req.on('error', (err: NodeJS.ErrnoException) => {
      const code = err.code;
      fail(
        new PinnedRequestError(
          isTlsError(code) ? 'webhook_tls_failed' : 'webhook_connect_failed',
          code,
        ),
      );
    });

    req.end(opts.body);
  });
}
