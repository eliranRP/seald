import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Webhook signatures (design doc § Webhook security → Signature).
 *
 *   Seald-Signature:          t=<unix seconds>,v1=<hex HMAC-SHA256>
 *   Seald-Signature-Previous: t=<unix seconds>,v1=<hex HMAC of the previous secret>
 *   Seald-Event-Id:           <automation_runs.id>
 *
 * The string to sign is `${t}.${rawBody}`. Receivers recompute it over the
 * raw request bytes, compare in constant time, and reject a `t` outside the
 * 300-second window, which defeats replay of a captured request. A retry
 * from Seald is a new `t` and a new signature over the same body `id`, so
 * receivers dedupe on `Seald-Event-Id` / body `id`, not on `t`.
 */

export const SIGNATURE_HEADER = 'Seald-Signature';
export const PREVIOUS_SIGNATURE_HEADER = 'Seald-Signature-Previous';
export const EVENT_ID_HEADER = 'Seald-Event-Id';
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signPayload(secret: string, timestampSeconds: number, rawBody: string): string {
  return createHmac('sha256', secret)
    .update(`${timestampSeconds}.${rawBody}`, 'utf8')
    .digest('hex');
}

export function signatureHeaderValue(
  secret: string,
  timestampSeconds: number,
  rawBody: string,
): string {
  return `t=${timestampSeconds},v1=${signPayload(secret, timestampSeconds, rawBody)}`;
}

export interface SignatureHeadersInput {
  readonly secret: string;
  /** Present only while the previous secret is inside its 24-hour window. */
  readonly previousSecret?: string | null;
  readonly runId: string;
  readonly timestampSeconds: number;
  readonly rawBody: string;
}

export function signatureHeaders(input: SignatureHeadersInput): Record<string, string> {
  const headers: Record<string, string> = {
    [SIGNATURE_HEADER]: signatureHeaderValue(input.secret, input.timestampSeconds, input.rawBody),
    [EVENT_ID_HEADER]: input.runId,
  };
  if (input.previousSecret) {
    headers[PREVIOUS_SIGNATURE_HEADER] = signatureHeaderValue(
      input.previousSecret,
      input.timestampSeconds,
      input.rawBody,
    );
  }
  return headers;
}

export type VerifyResult =
  | { readonly ok: true; readonly timestamp: number }
  | {
      readonly ok: false;
      readonly reason: 'malformed' | 'timestamp_outside_window' | 'signature_mismatch';
    };

/**
 * Reference receiver check (the "verify snippet" the docs publish).
 * Exported so tests pin the exact contract a receiver implements.
 */
export function verifySignatureHeader(input: {
  readonly header: string | undefined;
  readonly rawBody: string;
  readonly secret: string;
  readonly nowSeconds: number;
  readonly toleranceSeconds?: number;
}): VerifyResult {
  const header = input.header;
  if (!header) return { ok: false, reason: 'malformed' };
  const match = /^t=(\d{1,12}),v1=([0-9a-f]+)$/.exec(header.trim());
  const [, tText, hex] = match ?? [];
  if (!tText || !hex) return { ok: false, reason: 'malformed' };
  const t = Number(tText);
  const tolerance = input.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(input.nowSeconds - t) > tolerance) {
    return { ok: false, reason: 'timestamp_outside_window' };
  }
  const expected = Buffer.from(signPayload(input.secret, t, input.rawBody), 'utf8');
  const given = Buffer.from(hex, 'utf8');
  // Length mismatch fails closed before the constant-time compare.
  if (expected.length !== given.length) return { ok: false, reason: 'signature_mismatch' };
  if (!timingSafeEqual(expected, given)) return { ok: false, reason: 'signature_mismatch' };
  return { ok: true, timestamp: t };
}
