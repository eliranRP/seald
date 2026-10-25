import { randomBytes } from 'node:crypto';
import type { GotenbergClient } from './conversion.service';

/**
 * Word → PDF converter backed by the Google Drive API, for runtimes with
 * no Gotenberg sidecar (Supabase Edge Functions). Same contract as
 * {@link GotenbergClient}, so every caller (Drive import, local/MCP
 * uploads) works unchanged.
 *
 * It acts as ONE dedicated Google account (the "converter" account), not
 * as the end user, so users do not need Drive connected. Flow per call:
 *   1. refresh-token grant → access token (cached until ~1 min before expiry)
 *   2. multipart upload of the Word bytes, converted to a Google Doc
 *   3. files.export as application/pdf
 *   4. files.delete (always attempted, also on failure)
 * The `drive.file` scope is enough: the app only touches files it created.
 * Service accounts cannot be used here: they have no Drive storage quota
 * outside a Workspace shared drive.
 *
 * Errors surface as `{ ok: false, status }` (callers map that to
 * `conversion_failed`); aborts/timeouts are thrown as-is so callers can
 * map them to `conversion_timeout`. Tokens are never logged.
 */
export interface DriveConverterCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MIME = 'application/msword';

export function sourceMimeFor(filename: string): string {
  return /\.doc$/i.test(filename) ? DOC_MIME : DOCX_MIME;
}

export function makeDriveDocxConverter(
  creds: DriveConverterCredentials,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): GotenbergClient {
  let cached: { token: string; expiresAt: number } | null = null;

  async function accessToken(signal?: AbortSignal): Promise<string | { status: number }> {
    if (cached && cached.expiresAt > now()) return cached.token;
    const init: RequestInit = {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: creds.refreshToken,
      }).toString(),
    };
    if (signal) init.signal = signal;
    const res = await fetchImpl(TOKEN_URL, init);
    if (!res.ok) return { status: res.status };
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return { status: 502 };
    const ttlMs = Math.max(0, (json.expires_in ?? 3600) - 60) * 1000;
    cached = { token: json.access_token, expiresAt: now() + ttlMs };
    return json.access_token;
  }

  return async ({ fileBytes, filename, signal }) => {
    const fail = (status: number) => ({ ok: false, status, body: Buffer.alloc(0) });
    const token = await accessToken(signal);
    if (typeof token !== 'string') {
      // A revoked/expired refresh token must not stay cached.
      cached = null;
      return fail(token.status);
    }
    const auth = { authorization: `Bearer ${token}` };

    const boundary = `seald-${randomBytes(12).toString('hex')}`;
    const meta = JSON.stringify({ name: `seald-convert-${Date.now()}`, mimeType: GOOGLE_DOC_MIME });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
          `--${boundary}\r\ncontent-type: ${sourceMimeFor(filename)}\r\n\r\n`,
      ),
      fileBytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const upInit: RequestInit = {
      method: 'POST',
      headers: { ...auth, 'content-type': `multipart/related; boundary=${boundary}` },
      body: new Uint8Array(body),
    };
    if (signal) upInit.signal = signal;
    const up = await fetchImpl(UPLOAD_URL, upInit);
    if (!up.ok) {
      if (up.status === 401) cached = null;
      return fail(up.status);
    }
    const { id } = (await up.json()) as { id?: string };
    if (!id) return fail(502);

    try {
      const exInit: RequestInit = { headers: auth };
      if (signal) exInit.signal = signal;
      const ex = await fetchImpl(
        `${FILES_URL}/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent('application/pdf')}`,
        exInit,
      );
      const pdf = Buffer.from(await ex.arrayBuffer());
      return { ok: ex.ok, status: ex.status, body: ex.ok ? pdf : Buffer.alloc(0) };
    } finally {
      // Best effort, not tied to the caller's signal: the temp Doc must go
      // even when the export timed out.
      await fetchImpl(`${FILES_URL}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: auth,
      }).catch(() => undefined);
    }
  };
}
