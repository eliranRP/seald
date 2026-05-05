import { createHash, randomBytes } from 'node:crypto';

/**
 * RFC 7636 PKCE helpers + an in-memory state-nonce store. Each
 * `start()` mints a fresh `code_verifier`, derives the SHA-256
 * `code_challenge`, generates an opaque `state` nonce, and remembers
 * `(state → { codeVerifier, userId, expiresAt })` for 10 minutes. The
 * callback handler `consume(state)` returns the entry exactly once and
 * deletes it (single-use, defeats CSRF + replay).
 *
 * In-memory is fine for v1: each session uses 1 entry, expiry is short,
 * and a missed lookup just forces the user to re-click "Connect". Move
 * to Postgres when we have multiple API pods.
 */
export interface OAuthStateEntry {
  codeVerifier: string;
  userId: string;
  expiresAt: number;
}

export class OAuthStateStore {
  private readonly store = new Map<string, OAuthStateEntry>();
  constructor(
    private readonly ttlMs = 10 * 60 * 1000,
    private readonly clock: () => number = Date.now,
  ) {}

  start(userId: string): { state: string; codeVerifier: string; codeChallenge: string } {
    const codeVerifier = base64url(randomBytes(64));
    const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
    const state = base64url(randomBytes(32));
    this.gc();
    this.store.set(state, {
      codeVerifier,
      userId,
      expiresAt: this.clock() + this.ttlMs,
    });
    return { state, codeVerifier, codeChallenge };
  }

  consume(state: string): OAuthStateEntry | null {
    const entry = this.store.get(state);
    if (!entry) return null;
    this.store.delete(state);
    if (entry.expiresAt < this.clock()) return null;
    return entry;
  }

  private gc(): void {
    const now = this.clock();
    for (const [k, v] of this.store) {
      if (v.expiresAt < now) this.store.delete(k);
    }
  }
}

function base64url(b: Buffer): string {
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Build the Google OAuth consent URL.
 *
 * Scope: `drive.file` only — per-file access for files opened/created by our
 * app. Per-file consent is granted at picker click time. This is a
 * non-sensitive scope requiring only free brand verification (2-3 days).
 *
 * We do NOT request `drive.readonly` (RESTRICTED scope requiring paid CASA
 * audit: $4,500-$15,000+, 4-12 week timeline, annual renewal) or the broad
 * `drive` scope (full read+write to all files).
 */
export function buildConsentUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const scope = 'https://www.googleapis.com/auth/drive.file';
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
    state: args.state,
    code_challenge: args.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
