import type { AppEnv } from '../../config/env.schema';
import { SupabaseAdminError } from '../supabase-admin.client';
import { SupabaseAdminHttpClient } from '../supabase-admin.client.http';

/**
 * HTTP adapter for the Supabase admin "delete user" endpoint.
 *
 * Behaviors covered (port contract from supabase-admin.client.ts):
 *   - construction never throws even without a service-role key — the
 *     gate is at *call* time so the API can boot in dev/test
 *   - missing key at call time → SupabaseAdminError (mapped to 503 by
 *     the controller)
 *   - 200 / 204 / 404 → success (404 = idempotent retry, already gone)
 *   - any other non-2xx → SupabaseAdminError carrying the upstream
 *     status + truncated body (200-char cap from the adapter)
 *   - network-level fetch throw → SupabaseAdminError wrapping the
 *     underlying message
 *   - URL is correctly assembled (trailing slash on SUPABASE_URL is
 *     stripped) and BOTH `authorization: Bearer` and `apikey` headers
 *     are set (Supabase rejects when either is missing)
 *   - userId is URL-encoded
 */
const baseEnv = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'svc_role_test',
} as unknown as AppEnv;

describe('SupabaseAdminHttpClient', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('construction never throws even when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const env = { ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: undefined } as unknown as AppEnv;
    expect(() => new SupabaseAdminHttpClient(env)).not.toThrow();
  });

  it('deleteUser throws SupabaseAdminError when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    const env = { ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: undefined } as unknown as AppEnv;
    const client = new SupabaseAdminHttpClient(env);
    await expect(client.deleteUser('user-1')).rejects.toBeInstanceOf(SupabaseAdminError);
    await expect(client.deleteUser('user-1')).rejects.toMatchObject({
      message: expect.stringContaining('SUPABASE_SERVICE_ROLE_KEY'),
    });
  });

  it('200 → resolves; sends both authorization and apikey headers', async () => {
    const calls: Array<[string, RequestInit]> = [];
    global.fetch = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const client = new SupabaseAdminHttpClient(baseEnv);
    await client.deleteUser('00000000-0000-0000-0000-00000000000a');

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    expect(url).toBe(
      'https://example.supabase.co/auth/v1/admin/users/00000000-0000-0000-0000-00000000000a',
    );
    expect(init.method).toBe('DELETE');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer svc_role_test');
    expect(headers.apikey).toBe('svc_role_test');
  });

  it('204 → resolves (no-content success)', async () => {
    global.fetch = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const client = new SupabaseAdminHttpClient(baseEnv);
    await expect(client.deleteUser('user-1')).resolves.toBeUndefined();
  });

  it('404 → resolves (idempotent: user already gone)', async () => {
    // Critical: T-20 is retried on transient failure. If supabase has
    // already deleted the row, a retry must NOT fail or we'd never
    // converge.
    global.fetch = (async () =>
      new Response('not_found', { status: 404 })) as unknown as typeof fetch;
    const client = new SupabaseAdminHttpClient(baseEnv);
    await expect(client.deleteUser('ghost')).resolves.toBeUndefined();
  });

  it('500 → SupabaseAdminError carrying status + truncated body', async () => {
    const longBody = 'x'.repeat(500);
    global.fetch = (async () => new Response(longBody, { status: 500 })) as unknown as typeof fetch;
    const client = new SupabaseAdminHttpClient(baseEnv);
    let caught: unknown;
    try {
      await client.deleteUser('user-1');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SupabaseAdminError);
    const err = caught as SupabaseAdminError;
    expect(err.status).toBe(500);
    // The adapter caps the body slice at 200 chars to avoid log bloat;
    // the message therefore contains <= 200 of the upstream `x`s.
    const xCount = (err.message.match(/x/g) ?? []).length;
    expect(xCount).toBeLessThanOrEqual(200);
    expect(err.message).toContain('500');
  });

  it('401 → SupabaseAdminError (auth misconfig)', async () => {
    global.fetch = (async () =>
      new Response('jwt_invalid', { status: 401 })) as unknown as typeof fetch;
    const client = new SupabaseAdminHttpClient(baseEnv);
    await expect(client.deleteUser('user-1')).rejects.toMatchObject({
      name: 'SupabaseAdminError',
      status: 401,
    });
  });

  it('network failure → SupabaseAdminError wrapping the underlying message', async () => {
    global.fetch = (async () => {
      throw new Error('ENOTFOUND example.supabase.co');
    }) as unknown as typeof fetch;
    const client = new SupabaseAdminHttpClient(baseEnv);
    await expect(client.deleteUser('user-1')).rejects.toMatchObject({
      name: 'SupabaseAdminError',
      message: expect.stringContaining('ENOTFOUND'),
    });
  });

  it('strips trailing slashes off SUPABASE_URL when building the endpoint', async () => {
    const env = { ...baseEnv, SUPABASE_URL: 'https://example.supabase.co///' } as AppEnv;
    const calls: string[] = [];
    global.fetch = (async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const client = new SupabaseAdminHttpClient(env);
    await client.deleteUser('u1');
    // Just one slash between the host and the path, not several.
    expect(calls[0]).toBe('https://example.supabase.co/auth/v1/admin/users/u1');
  });

  it('URL-encodes the userId so weird characters cannot break the path', async () => {
    const calls: string[] = [];
    global.fetch = (async (url: string) => {
      calls.push(url);
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const client = new SupabaseAdminHttpClient(baseEnv);
    await client.deleteUser('weird id/with?stuff');
    expect(calls[0]).toContain('weird%20id%2Fwith%3Fstuff');
  });

  it('502 with an unreadable body still throws a structured error', async () => {
    // Force res.text() to reject so the catch-and-ignore branch runs.
    const res = new Response(null, { status: 502 });
    Object.defineProperty(res, 'text', {
      value: async () => {
        throw new Error('body_disconnect');
      },
    });
    global.fetch = (async () => res) as unknown as typeof fetch;
    const client = new SupabaseAdminHttpClient(baseEnv);
    await expect(client.deleteUser('user-1')).rejects.toMatchObject({
      name: 'SupabaseAdminError',
      status: 502,
    });
  });
});
