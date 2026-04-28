import type { AppEnv } from '../config/env.schema';
import { StorageError, SupabaseStorageService } from './storage.service';

const BASE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  STORAGE_BUCKET: 'envelopes',
} as unknown as AppEnv;

describe('SupabaseStorageService', () => {
  let originalFetch: typeof fetch;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = jest.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('constructs without service-role key; throws on first use', async () => {
    // Deferred validation so unit + e2e tests that never touch storage still
    // boot cleanly. Production deploys always have the key; this error surfaces
    // on the first upload if a deploy is misconfigured.
    const env = { ...BASE_ENV, SUPABASE_SERVICE_ROLE_KEY: undefined } as unknown as AppEnv;
    const svc = new SupabaseStorageService(env);
    await expect(svc.upload('x.pdf', Buffer.from('x'), 'application/pdf')).rejects.toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  describe('upload', () => {
    it('POSTs to the object endpoint with upsert + auth headers', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      mockFetch.mockResolvedValue(new Response('', { status: 200 }) as unknown as Response);

      await svc.upload(
        'abc/original.pdf',
        Buffer.from([0x25, 0x50, 0x44, 0x46]),
        'application/pdf',
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://example.supabase.co/storage/v1/object/envelopes/abc/original.pdf');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.apikey).toBe('test-service-role');
      expect(headers.Authorization).toBe('Bearer test-service-role');
      expect(headers['Content-Type']).toBe('application/pdf');
      expect(headers['x-upsert']).toBe('true');
    });

    it('throws StorageError on non-2xx', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      mockFetch.mockResolvedValue(
        new Response('quota exceeded', { status: 413 }) as unknown as Response,
      );
      await expect(
        svc.upload('abc/original.pdf', Buffer.from('x'), 'application/pdf'),
      ).rejects.toBeInstanceOf(StorageError);
    });

    it('URL-encodes path segments but preserves slashes', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      mockFetch.mockResolvedValue(new Response('', { status: 200 }) as unknown as Response);
      await svc.upload('my folder/with space.pdf', Buffer.from('x'), 'application/pdf');
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toContain('/envelopes/my%20folder/with%20space.pdf');
    });
  });

  describe('download', () => {
    it('GETs the object and returns a Buffer', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      const payload = new Uint8Array([0x01, 0x02, 0x03]);
      mockFetch.mockResolvedValue(new Response(payload, { status: 200 }) as unknown as Response);
      const out = await svc.download('abc/original.pdf');
      expect(Array.from(out)).toEqual([1, 2, 3]);
    });

    it('throws on 404', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      mockFetch.mockResolvedValue(
        new Response('not found', { status: 404 }) as unknown as Response,
      );
      await expect(svc.download('missing.pdf')).rejects.toBeInstanceOf(StorageError);
    });
  });

  describe('createSignedUrl', () => {
    it('returns an absolute signed URL', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      mockFetch.mockResolvedValue(
        new Response(
          JSON.stringify({ signedURL: '/object/sign/envelopes/abc/original.pdf?token=deadbeef' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ) as unknown as Response,
      );
      const url = await svc.createSignedUrl('abc/original.pdf', 90);
      expect(url).toBe(
        'https://example.supabase.co/storage/v1/object/sign/envelopes/abc/original.pdf?token=deadbeef',
      );
    });
  });

  describe('exists', () => {
    it('returns true on 200', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      mockFetch.mockResolvedValue(new Response('', { status: 200 }) as unknown as Response);
      expect(await svc.exists('x.pdf')).toBe(true);
    });

    it('returns false on 404', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      mockFetch.mockResolvedValue(new Response('', { status: 404 }) as unknown as Response);
      expect(await svc.exists('x.pdf')).toBe(false);
    });

    it('throws on unexpected status', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      mockFetch.mockResolvedValue(new Response('boom', { status: 500 }) as unknown as Response);
      await expect(svc.exists('x.pdf')).rejects.toBeInstanceOf(StorageError);
    });
  });

  describe('remove', () => {
    it('skips fetch when given an empty list', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      await svc.remove([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('DELETEs with the prefixes payload', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      mockFetch.mockResolvedValue(new Response('[]', { status: 200 }) as unknown as Response);
      await svc.remove(['a.pdf', 'b.pdf']);
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('DELETE');
      expect(init.body).toContain('"a.pdf"');
      expect(init.body).toContain('"b.pdf"');
    });
  });

  // Regression: rule 9.3 — outbound HTTP without a timeout hangs the worker on
  // a stalled Supabase node. SupabaseStorageService now installs an
  // AbortSignal.timeout per call; a thrown AbortError/TimeoutError is mapped to
  // StorageError('timeout', 504) so the email/sealing workers see a uniform
  // shape and can decide to retry.
  describe('fetch timeout (rule 9.3)', () => {
    it('passes an AbortSignal on every call', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      mockFetch.mockResolvedValue(new Response('', { status: 200 }) as unknown as Response);
      await svc.exists('x.pdf');
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('maps an aborted fetch to StorageError(504, timeout)', async () => {
      const svc = new SupabaseStorageService(BASE_ENV);
      const abortError = Object.assign(new Error('The operation was aborted'), {
        name: 'AbortError',
      });
      mockFetch.mockRejectedValue(abortError);
      await expect(svc.download('abc/original.pdf')).rejects.toMatchObject({
        name: 'StorageError',
        status: 504,
      });
    });
  });
});
