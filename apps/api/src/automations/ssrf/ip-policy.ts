import { isIP } from 'node:net';

/**
 * Address policy for outbound automation webhooks (design doc § Webhook
 * security → SSRF). Fails closed: an address that does not parse, or that
 * falls in any special-purpose range below, is blocked.
 *
 * Addresses are handled as bytes, never as strings, so alternative textual
 * forms (`::ffff:7f00:1`, `0:0:0:0:0:ffff:127.0.0.1`, upper-case hex,
 * zero-padded groups) all classify the same way. Decimal, octal and hex
 * IPv4 hostnames (`2130706433`, `0177.0.0.1`, `0x7f.1`) are normalized to
 * dotted quads by the WHATWG URL parser before they reach this module, and
 * `parseIPv4` itself only accepts canonical dotted-decimal quads, so any
 * odd form that slips through fails closed.
 */

export type IpFamily = 4 | 6;

export interface ParsedIp {
  readonly family: IpFamily;
  /** 4 bytes for IPv4, 16 bytes for IPv6. */
  readonly bytes: Uint8Array;
}

interface Cidr {
  readonly bytes: Uint8Array;
  readonly prefix: number;
  readonly label: string;
}

/** Canonical dotted-decimal only: four 0–255 parts, no leading zeros. */
export function parseIPv4(text: string): Uint8Array | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  const out = new Uint8Array(4);
  for (const [i, p] of parts.entries()) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out[i] = n;
  }
  return out;
}

/** RFC 4291 text forms, including `::` and a trailing dotted IPv4. No zone ids. */
export function parseIPv6(text: string): Uint8Array | null {
  if (text.includes('%')) return null;
  if (isIP(text) !== 6) return null;
  let head = text;
  let tailV4: Uint8Array | null = null;
  const lastColon = head.lastIndexOf(':');
  const lastGroup = head.slice(lastColon + 1);
  if (lastGroup.includes('.')) {
    tailV4 = parseIPv4(lastGroup);
    if (!tailV4) return null;
    head = `${head.slice(0, lastColon + 1)}0:0`;
  }
  const halves = head.split('::');
  if (halves.length > 2) return null;
  const toGroups = (s: string): string[] => (s === '' ? [] : s.split(':'));
  const [leftText = '', rightText = ''] = halves;
  const left = toGroups(leftText);
  const right = halves.length === 2 ? toGroups(rightText) : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...left, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...right];
  if (groups.length !== 8) return null;
  const out = new Uint8Array(16);
  for (const [i, g] of groups.entries()) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    const v = parseInt(g, 16);
    out[i * 2] = v >> 8;
    out[i * 2 + 1] = v & 0xff;
  }
  if (tailV4) out.set(tailV4, 12);
  return out;
}

/** Parse an IP literal (brackets allowed for IPv6). Null when it is not one. */
export function parseIp(text: string): ParsedIp | null {
  const t = text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1) : text;
  const v4 = parseIPv4(t);
  if (v4) return { family: 4, bytes: v4 };
  const v6 = parseIPv6(t);
  if (v6) return { family: 6, bytes: v6 };
  return null;
}

function cidr(text: string, label: string): Cidr {
  const [addr, prefixText] = text.split('/');
  const parsed = parseIp(addr ?? '');
  if (!parsed) throw new Error(`bad cidr ${text}`);
  return { bytes: parsed.bytes, prefix: Number(prefixText), label };
}

function inCidr(bytes: Uint8Array, range: Cidr): boolean {
  if (bytes.length !== range.bytes.length) return false;
  let bits = range.prefix;
  for (let i = 0; i < bytes.length && bits > 0; i += 1) {
    const take = Math.min(8, bits);
    const mask = (0xff << (8 - take)) & 0xff;
    if (((bytes[i] ?? 0) & mask) !== ((range.bytes[i] ?? 0) & mask)) return false;
    bits -= take;
  }
  return true;
}

/**
 * IPv4 ranges that are never a customer webhook. Every range the design
 * doc names, plus the documentation and relay ranges (stricter is fine).
 */
const BLOCKED_V4: readonly Cidr[] = [
  cidr('0.0.0.0/8', 'unspecified'),
  cidr('10.0.0.0/8', 'private'),
  cidr('100.64.0.0/10', 'carrier_nat'),
  cidr('127.0.0.0/8', 'loopback'),
  cidr('169.254.0.0/16', 'link_local'),
  cidr('172.16.0.0/12', 'private'),
  cidr('192.0.0.0/24', 'ietf_protocol'),
  cidr('192.0.2.0/24', 'documentation'),
  cidr('192.88.99.0/24', 'relay_anycast'),
  cidr('192.168.0.0/16', 'private'),
  cidr('198.18.0.0/15', 'benchmarking'),
  cidr('198.51.100.0/24', 'documentation'),
  cidr('203.0.113.0/24', 'documentation'),
  cidr('224.0.0.0/4', 'multicast'),
  // Includes the limited broadcast address 255.255.255.255.
  cidr('240.0.0.0/4', 'reserved'),
];

/**
 * IPv6 ranges checked before the global-unicast rule, so tests and logs get
 * a precise label. Anything outside `2000::/3` is blocked regardless.
 */
const BLOCKED_V6: readonly Cidr[] = [
  cidr('::/128', 'unspecified'),
  cidr('::1/128', 'loopback'),
  // Deprecated IPv4-compatible addresses (`::a.b.c.d`).
  cidr('::/96', 'ipv4_compatible'),
  cidr('64:ff9b::/96', 'nat64'),
  cidr('64:ff9b:1::/48', 'nat64'),
  cidr('100::/64', 'discard'),
  // IETF protocol assignments: Teredo (2001::/32), benchmarking, ORCHID.
  cidr('2001::/23', 'ietf_protocol'),
  cidr('2001:db8::/32', 'documentation'),
  cidr('3fff::/20', 'documentation'),
  cidr('fc00::/7', 'unique_local'),
  cidr('fe80::/10', 'link_local'),
  cidr('fec0::/10', 'site_local'),
  cidr('ff00::/8', 'multicast'),
];

const IPV4_MAPPED = cidr('::ffff:0:0/96', 'ipv4_mapped');
const SIX_TO_FOUR = cidr('2002::/16', '6to4');
const GLOBAL_UNICAST_V6 = cidr('2000::/3', 'global_unicast');

export type IpVerdict =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string };

function checkV4(bytes: Uint8Array, via?: string): IpVerdict {
  for (const range of BLOCKED_V4) {
    if (inCidr(bytes, range)) {
      return { allowed: false, reason: via ? `${via}:${range.label}` : range.label };
    }
  }
  return { allowed: true };
}

/** Classify one parsed address. */
export function checkIp(ip: ParsedIp): IpVerdict {
  if (ip.family === 4) return checkV4(ip.bytes);
  const b = ip.bytes;
  // IPv4-mapped (::ffff:a.b.c.d): judge the embedded IPv4 address. Even a
  // public embedded address is blocked: a mapped literal is never a normal
  // webhook target and only shows up as an evasion attempt.
  if (inCidr(b, IPV4_MAPPED)) {
    const inner = checkV4(b.subarray(12, 16), 'ipv4_mapped');
    return inner.allowed ? { allowed: false, reason: 'ipv4_mapped' } : inner;
  }
  // 6to4 (2002:<32-bit IPv4 in hex>::/48): blocked when the embedded IPv4 is blocked.
  if (inCidr(b, SIX_TO_FOUR)) {
    const inner = checkV4(b.subarray(2, 6), '6to4');
    if (!inner.allowed) return inner;
  }
  for (const range of BLOCKED_V6) {
    if (inCidr(b, range)) return { allowed: false, reason: range.label };
  }
  if (!inCidr(b, GLOBAL_UNICAST_V6)) return { allowed: false, reason: 'not_global_unicast' };
  return { allowed: true };
}

/** Classify an address string (e.g. a DNS answer). Unparseable fails closed. */
export function checkIpText(text: string): IpVerdict {
  const parsed = parseIp(text);
  if (!parsed) return { allowed: false, reason: 'unparseable' };
  return checkIp(parsed);
}

/** Canonical text for comparisons (lower-case IPv6, no brackets). */
export function canonicalIp(ip: ParsedIp): string {
  if (ip.family === 4) return Array.from(ip.bytes).join('.');
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    groups.push((((ip.bytes[i] ?? 0) << 8) | (ip.bytes[i + 1] ?? 0)).toString(16));
  }
  return groups.join(':');
}
