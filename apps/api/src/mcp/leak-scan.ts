/**
 * Token-shaped strings that must never appear in a tool result
 * (docs/design/mcp-server.md, Non-goals and Test plan): signing-link
 * tokens, API keys, token hashes, storage paths, approval links. A
 * short-lived signed storage URL is allowed only in the named top-level
 * field of a tool that exists to hand one out (`envelopes_download_url`).
 */
interface Check {
  readonly name: string;
  readonly re: RegExp;
}

const NEVER: readonly Check[] = [
  { name: 'signing link token', re: /[?&]t=/ },
  { name: 'api key', re: /seald_live_/ },
  // WP-27: OAuth access and refresh tokens.
  { name: 'oauth token', re: /seald_o[ar]t_/ },
  { name: 'token hash column', re: /access_token_hash/ },
  { name: 'storage path column', re: /storage_path|_file_path/ },
  { name: 'link token', re: /link_token/ },
  { name: 'approval token link', re: /\/approve#/ },
];

/** A signed storage URL carries a token (often a JWT) in its query string. */
const SIGNED: readonly Check[] = [
  { name: 'signed url query', re: /[?&](token|X-Amz-Signature|signature)=/i },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/ },
];

export interface LeakFinding {
  readonly pattern: string;
}

function scan(text: string, checks: readonly Check[], found: LeakFinding[]): void {
  for (const check of checks) {
    if (check.re.test(text) && !found.some((f) => f.pattern === check.name)) {
      found.push({ pattern: check.name });
    }
  }
}

/**
 * Scan a tool result. Returns the names of the patterns found, never the
 * matched text, so a finding can be logged safely. `signedUrlFields` are
 * top-level keys whose string value may be a signed URL; they are still
 * checked for everything else.
 */
export function findTokenShapedStrings(
  value: unknown,
  opts: { readonly signedUrlFields?: readonly string[] } = {},
): LeakFinding[] {
  const found: LeakFinding[] = [];
  const allowed = new Set(opts.signedUrlFields ?? []);
  let rest: unknown = value;
  if (allowed.size > 0 && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const key of allowed) {
      const v = copy[key];
      if (typeof v === 'string') scan(v, NEVER, found);
      delete copy[key];
    }
    rest = copy;
  }
  const text = typeof rest === 'string' ? rest : JSON.stringify(rest);
  if (text !== undefined) scan(text, [...NEVER, ...SIGNED], found);
  return found;
}
