import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';

/**
 * Thin port + default adapter for Supabase Storage.
 *
 * We target the storage REST API directly (not @supabase/supabase-js) for two
 * reasons: (1) one fewer dependency on the worker, (2) predictable error
 * shapes we can map in our own error slugs. All writes authenticate with the
 * service-role key — the backend is the sole gate; there's no scenario where
 * we want storage talking to the user's JWT.
 */
@Injectable()
export abstract class StorageService {
  abstract upload(path: string, body: Buffer, contentType: string): Promise<void>;
  abstract download(path: string): Promise<Buffer>;
  abstract remove(paths: string[]): Promise<void>;
  abstract createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
  /** Returns true if the object exists. Used for assertions after upload. */
  abstract exists(path: string): Promise<boolean>;
}

/**
 * Domain error surfaced when the storage backend is unreachable or refused
 * the request. Service layer maps to 500; worker retries.
 */
export class StorageError extends Error {
  constructor(
    public readonly operation: string,
    public readonly status: number,
    body: string,
  ) {
    super(`storage_${operation}_failed_${status}: ${body}`);
    this.name = 'StorageError';
  }
}

/**
 * Outbound HTTP timeout for every Supabase Storage call (rule 9.3). Without
 * this, a hung network or a stalled object-store node blocks the worker
 * thread indefinitely, which under the in-process worker model also stalls
 * sealing for every other envelope.
 */
const STORAGE_FETCH_TIMEOUT_MS = 30_000;

@Injectable()
export class SupabaseStorageService extends StorageService {
  private readonly baseUrl: string;
  private readonly bucket: string;
  private readonly serviceRoleKey: string | undefined;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    super();
    // Validation is deferred to first use: unit tests and routes that never
    // touch Storage (health, auth, contacts) must be able to boot without a
    // service-role key. Production deploys WILL have it, and any storage
    // call at boot-verification time exercises the check clearly.
    this.baseUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1`;
    this.bucket = env.STORAGE_BUCKET;
    this.serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  }

  private authHeaders(): Record<string, string> {
    if (!this.serviceRoleKey) {
      throw new Error(
        'SUPABASE_SERVICE_ROLE_KEY is required for StorageService operations. ' +
          'Set it in apps/api/.env (never in git). ' +
          'Storage uploads require the service-role JWT.',
      );
    }
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
  }

  async upload(path: string, body: Buffer, contentType: string): Promise<void> {
    const url = `${this.baseUrl}/object/${this.bucket}/${encodePath(path)}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        ...this.authHeaders(),
        'Content-Type': contentType,
        'x-upsert': 'true',
        'cache-control': 'no-store',
      },
      body: new Uint8Array(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new StorageError('upload', res.status, text);
    }
  }

  async download(path: string): Promise<Buffer> {
    const url = `${this.baseUrl}/object/${this.bucket}/${encodePath(path)}`;
    const res = await fetchWithTimeout(url, { method: 'GET', headers: this.authHeaders() });
    if (!res.ok) {
      const text = await res.text();
      throw new StorageError('download', res.status, text);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  async remove(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const url = `${this.baseUrl}/object/${this.bucket}`;
    const res = await fetchWithTimeout(url, {
      method: 'DELETE',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new StorageError('remove', res.status, text);
    }
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    const url = `${this.baseUrl}/object/sign/${this.bucket}/${encodePath(path)}`;
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: expiresInSeconds }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new StorageError('sign', res.status, text);
    }
    const json = (await res.json()) as { signedURL?: string; signedUrl?: string };
    const rel = json.signedURL ?? json.signedUrl;
    if (!rel) throw new StorageError('sign', 500, 'response missing signedURL');
    // Supabase returns a path like /object/sign/<bucket>/<path>?token=… that
    // is relative to the storage API root (/storage/v1).
    return `${this.baseUrl}${rel}`;
  }

  async exists(path: string): Promise<boolean> {
    const url = `${this.baseUrl}/object/${this.bucket}/${encodePath(path)}`;
    const res = await fetchWithTimeout(url, { method: 'HEAD', headers: this.authHeaders() });
    if (res.ok) return true;
    if (res.status === 404 || res.status === 400) return false;
    const text = await res.text();
    throw new StorageError('head', res.status, text);
  }
}

/**
 * Wrap `fetch` with `AbortSignal.timeout()` (rule 9.3). A caller-supplied
 * `signal` (if any) is composed with the timeout via `AbortSignal.any` so the
 * earlier of the two wins. Surfaces the timeout as a `StorageError` instead of
 * the raw DOMException so error mapping in callers stays uniform.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(STORAGE_FETCH_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  try {
    return await fetch(url, { ...init, signal });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new StorageError(
        'timeout',
        504,
        `${init.method ?? 'GET'} ${url} aborted: ${err.message}`,
      );
    }
    throw err;
  }
}

/** Encode each path segment independently so slashes are preserved as path separators. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
