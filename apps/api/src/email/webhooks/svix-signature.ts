import { createHmac, timingSafeEqual } from 'node:crypto';

/** Svix (and so Resend) reject a delivery whose timestamp is older than this. */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  readonly id: string | undefined;
  readonly timestamp: string | undefined;
  readonly signature: string | undefined;
}

/**
 * Verify a Svix webhook signature (https://docs.svix.com/receiving/verifying-payloads/how-manual).
 *
 * The signed content is `<svix-id>.<svix-timestamp>.<raw body>`, HMAC-SHA256
 * with the base64 key behind the `whsec_` prefix. `svix-signature` holds one
 * or more space-separated `v1,<base64>` entries (more than one while a secret
 * is being rotated); any match passes. Compared in constant time. The body
 * must be the raw bytes as received: a re-serialized JSON body does not match.
 */
export function verifySvixSignature(
  secret: string,
  rawBody: string,
  headers: SvixHeaders,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isInteger(ts)) return false;
  if (Math.abs(nowSeconds - ts) > SVIX_TOLERANCE_SECONDS) return false;

  const keyText = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const key = Buffer.from(keyText, 'base64');
  if (key.length === 0) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();

  for (const entry of signature.split(' ')) {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) continue;
    const given = Buffer.from(value, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}
