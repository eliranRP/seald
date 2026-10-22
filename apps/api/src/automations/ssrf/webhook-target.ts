import { promises as dnsPromises } from 'node:dns';
import { canonicalIp, checkIp, parseIp, type IpFamily } from './ip-policy';

/**
 * Turns a stored webhook URL into one pinned, checked destination (design
 * doc § Webhook security → SSRF). Runs before every attempt, retries
 * included. DNS is resolved exactly once here; the HTTP client connects to
 * the returned address and never resolves the name again, so a DNS
 * rebinding answer cannot swap the target between check and connect.
 */

export interface ResolvedAddress {
  readonly address: string;
  readonly family: IpFamily;
}

/** `dns.lookup(host, { all: true })` shape. Injected in tests (stub resolver). */
export type WebhookResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

/**
 * Test-only relaxations. Honoured only when `NODE_ENV === 'test'`
 * (`effectiveAllowance`), so a production process has no allowlist even if
 * one is wired in by mistake.
 */
export interface WebhookTestAllowance {
  /** Permit `http:` (a plain local test receiver). */
  readonly allowHttp?: boolean;
  /** Permit ports other than 443. */
  readonly allowAnyPort?: boolean;
  /** Exact addresses that bypass the range denylist (e.g. `127.0.0.1`). */
  readonly allowAddresses?: readonly string[];
}

export interface WebhookTarget {
  readonly protocol: 'https:' | 'http:';
  /** Lower-case hostname without brackets or trailing dot. Used for SNI and Host. */
  readonly hostname: string;
  /** True when the URL host is an IP literal (no SNI is sent then). */
  readonly hostIsIp: boolean;
  readonly port: number;
  /** Path plus query, never the fragment. */
  readonly path: string;
  /** The `Host` header value. */
  readonly hostHeader: string;
  readonly address: string;
  readonly family: IpFamily;
}

export type TargetOutcome =
  | { readonly ok: true; readonly target: WebhookTarget }
  /** Permanent: the URL or every address it resolves to is not allowed. */
  | { readonly ok: false; readonly kind: 'blocked'; readonly reason: string }
  /** Transient: DNS failed or timed out. */
  | { readonly ok: false; readonly kind: 'dns'; readonly reason: string };

export const MAX_WEBHOOK_URL_LENGTH = 2048;
export const DNS_TIMEOUT_MS = 5_000;

/** Hostnames that are never a customer endpoint, regardless of DNS. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
]);

/** Suffixes for internal-only names. */
const BLOCKED_SUFFIXES = [
  '.localhost',
  '.internal',
  '.local',
  '.localdomain',
  '.home.arpa',
  '.arpa',
  '.intranet',
  '.corp',
  '.lan',
];

/** Seald's own public hosts. Env-derived hosts are added by `sealdOwnHosts`. */
export const SEALD_STATIC_HOSTS: readonly string[] = [
  'seald.nromomentum.com',
  'api.seald.nromomentum.com',
];

export const defaultResolver: WebhookResolver = async (hostname) => {
  const answers = await dnsPromises.lookup(hostname, { all: true, verbatim: true });
  return answers.map((a) => ({ address: a.address, family: a.family === 6 ? 6 : 4 }));
};

export function effectiveAllowance(
  nodeEnv: string | undefined,
  allowance: WebhookTestAllowance | undefined,
): WebhookTestAllowance {
  return nodeEnv === 'test' && allowance ? allowance : {};
}

/**
 * Hostnames of Seald's API, app, Supabase and database, from the parsed env
 * plus the known production names. A webhook may not point at any of them
 * or at a subdomain of them.
 */
export function sealdOwnHosts(urls: readonly (string | undefined)[]): string[] {
  const out = new Set(SEALD_STATIC_HOSTS);
  for (const raw of urls) {
    if (!raw) continue;
    for (const part of raw.split(',')) {
      try {
        const h = normalizeHostname(new URL(part.trim()).hostname);
        if (h) out.add(h);
      } catch {
        // Not a URL; nothing to add.
      }
    }
  }
  return [...out];
}

function normalizeHostname(raw: string): string {
  let h = raw.toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  while (h.endsWith('.')) h = h.slice(0, -1);
  return h;
}

function matchesHost(hostname: string, base: string): boolean {
  return hostname === base || hostname.endsWith(`.${base}`);
}

/**
 * Static URL checks, no network. Returns the parsed pieces or a block
 * reason. Exported so a create/update path can reject a bad URL up front.
 */
export function checkWebhookUrl(
  rawUrl: string,
  opts: { readonly ownHosts: readonly string[]; readonly allowance?: WebhookTestAllowance },
):
  | {
      readonly ok: true;
      readonly url: URL;
      readonly hostname: string;
      readonly port: number;
      readonly literal: ReturnType<typeof parseIp>;
    }
  | { readonly ok: false; readonly reason: string } {
  const allowance = opts.allowance ?? {};
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return { ok: false, reason: 'empty' };
  if (rawUrl.length > MAX_WEBHOOK_URL_LENGTH) return { ok: false, reason: 'too_long' };
  // Control characters and whitespace are rejected rather than trimmed.
  if (hasControlOrSpace(rawUrl)) return { ok: false, reason: 'bad_characters' };
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'unparseable' };
  }
  const httpAllowed = allowance.allowHttp === true;
  if (url.protocol !== 'https:' && !(httpAllowed && url.protocol === 'http:')) {
    return { ok: false, reason: 'scheme' };
  }
  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'userinfo' };
  const defaultPort = url.protocol === 'https:' ? 443 : 80;
  const port = url.port === '' ? defaultPort : Number(url.port);
  if (port !== 443 && allowance.allowAnyPort !== true) return { ok: false, reason: 'port' };

  const hostname = normalizeHostname(url.hostname);
  if (hostname === '') return { ok: false, reason: 'empty_host' };
  const literal = parseIp(hostname);
  if (!literal) {
    if (BLOCKED_HOSTNAMES.has(hostname)) return { ok: false, reason: 'internal_hostname' };
    if (BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
      return { ok: false, reason: 'internal_hostname' };
    }
    // Single-label names resolve through search domains to internal hosts.
    if (!hostname.includes('.')) return { ok: false, reason: 'single_label_hostname' };
    // Anything that still looks numeric was not normalized to an address
    // by the URL parser; refuse instead of guessing how a resolver reads it.
    if (/^[0-9.]+$/.test(hostname) || /^0x/i.test(hostname)) {
      return { ok: false, reason: 'ambiguous_numeric_host' };
    }
    if (opts.ownHosts.some((own) => matchesHost(hostname, own))) {
      return { ok: false, reason: 'seald_host' };
    }
  }
  return { ok: true, url, hostname, port, literal };
}

function hasControlOrSpace(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c <= 0x20 || c === 0x7f) return true;
  }
  return false;
}

function allowListed(address: string, allowance: WebhookTestAllowance): boolean {
  const list = allowance.allowAddresses;
  if (!list || list.length === 0) return false;
  const parsed = parseIp(address);
  if (!parsed) return false;
  const canon = canonicalIp(parsed);
  return list.some((a) => {
    const p = parseIp(a);
    return p !== null && canonicalIp(p) === canon;
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error('dns timeout'), { code: 'ETIMEOUT' })),
      ms,
    );
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Full pre-flight for one attempt: static URL checks, then a single DNS
 * resolution, then every answer checked against the address policy. If any
 * answer is blocked the whole target is blocked (a mixed answer is a
 * rebinding attempt). The first answer is pinned for the connection.
 */
export async function resolveWebhookTarget(
  rawUrl: string,
  opts: {
    readonly ownHosts: readonly string[];
    readonly resolver?: WebhookResolver;
    readonly allowance?: WebhookTestAllowance;
    readonly dnsTimeoutMs?: number;
  },
): Promise<TargetOutcome> {
  const allowance = opts.allowance ?? {};
  const checked = checkWebhookUrl(rawUrl, { ownHosts: opts.ownHosts, allowance });
  if (!checked.ok) return { ok: false, kind: 'blocked', reason: checked.reason };
  const { url, hostname, port, literal } = checked;

  let answers: readonly ResolvedAddress[];
  if (literal) {
    answers = [{ address: canonicalIp(literal), family: literal.family }];
  } else {
    try {
      answers = await withTimeout(
        (opts.resolver ?? defaultResolver)(hostname),
        opts.dnsTimeoutMs ?? DNS_TIMEOUT_MS,
      );
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      return { ok: false, kind: 'dns', reason: typeof code === 'string' ? code : 'dns_error' };
    }
    if (answers.length === 0) return { ok: false, kind: 'dns', reason: 'no_answer' };
  }

  for (const a of answers) {
    const parsed = parseIp(a.address);
    if (!parsed) return { ok: false, kind: 'blocked', reason: 'unparseable_answer' };
    if (allowListed(a.address, allowance)) continue;
    const verdict = checkIp(parsed);
    if (!verdict.allowed) return { ok: false, kind: 'blocked', reason: verdict.reason };
  }

  const first = answers[0];
  const pinned = first ? parseIp(first.address) : null;
  if (!pinned) return { ok: false, kind: 'dns', reason: 'no_answer' };
  const defaultPort = url.protocol === 'https:' ? 443 : 80;
  const hostForHeader = literal?.family === 6 ? `[${hostname}]` : hostname;
  return {
    ok: true,
    target: {
      protocol: url.protocol === 'http:' ? 'http:' : 'https:',
      hostname,
      hostIsIp: literal !== null,
      port,
      path: `${url.pathname}${url.search}`,
      hostHeader: port === defaultPort ? hostForHeader : `${hostForHeader}:${port}`,
      address: canonicalIp(pinned),
      family: pinned.family,
    },
  };
}
