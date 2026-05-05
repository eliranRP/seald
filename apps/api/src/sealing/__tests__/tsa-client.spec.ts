/**
 * Tests for `TsaClient` — focus is on F-11 multi-TSA fallback behaviour.
 *
 * The CMS / RFC 3161 wire-level construction is exercised end-to-end in
 * `test/pades-tsa.e2e-spec.ts` against a real TSA; here we mock `fetch`
 * to drive the fallback / failure paths deterministically.
 */

import { TsaClient } from '../tsa-client';
import type { AppEnv } from '../../config/env.schema';

/**
 * Build a synthetic TimeStampResp DER blob with a given PKIStatus integer.
 * The bytes only need to round-trip through `parseTimestampResp`; we don't
 * exercise the embedded TimeStampToken here (covered by the e2e suite).
 *
 *   TimeStampResp ::= SEQUENCE {
 *     status      SEQUENCE { status INTEGER, ... },
 *     timeStampToken TimeStampToken OPTIONAL
 *   }
 */
function buildSyntheticTsr(status: number): Buffer {
  // Hand-rolled DER: outer SEQUENCE { inner SEQUENCE { INTEGER status } }.
  return Buffer.from([0x30, 0x05, 0x30, 0x03, 0x02, 0x01, status]);
}

function makeEnv(over: Partial<AppEnv>): AppEnv {
  return { ...({} as AppEnv), ...over };
}

/**
 * Minimal Response stand-in. We mirror just the fields TsaClient touches
 * (`ok`, `status`, `arrayBuffer`) so the cast through `unknown` to
 * `typeof globalThis.fetch` doesn't drag the full DOM Response type into
 * a node-runtime test.
 */
interface FakeResponse {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
function tsrResponse(status: number): FakeResponse {
  const buf = buildSyntheticTsr(status);
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}
function httpFailure(status: number): FakeResponse {
  return {
    ok: false,
    status,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

describe('TsaClient — multi-URL fallback (F-11)', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns the result from the first TSA when only PDF_SIGNING_TSA_URL is set', async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (url: string) => {
      calls.push(url);
      return tsrResponse(0);
    }) as unknown as typeof globalThis.fetch;

    const env = makeEnv({ PDF_SIGNING_TSA_URL: 'https://tsa-only.example/tsr' });
    const client = new TsaClient(env);
    const result = await client.timestamp(Buffer.from('payload'));
    expect(result.tsaUrl).toBe('https://tsa-only.example/tsr');
    expect(calls).toEqual(['https://tsa-only.example/tsr']);
  });

  it('prefers PDF_SIGNING_TSA_URLS (CSV) over PDF_SIGNING_TSA_URL when both are set', async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (url: string) => {
      calls.push(url);
      return tsrResponse(0);
    }) as unknown as typeof globalThis.fetch;

    const env = makeEnv({
      PDF_SIGNING_TSA_URL: 'https://legacy.example/tsr',
      PDF_SIGNING_TSA_URLS: 'https://primary.example/tsr,https://secondary.example/tsr',
    });
    const client = new TsaClient(env);
    const result = await client.timestamp(Buffer.from('payload'));
    expect(result.tsaUrl).toBe('https://primary.example/tsr');
    expect(calls).toEqual(['https://primary.example/tsr']);
  });

  it('falls back to the next URL when the first returns HTTP 5xx', async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('primary')) return httpFailure(502);
      return tsrResponse(0);
    }) as unknown as typeof globalThis.fetch;

    const env = makeEnv({
      PDF_SIGNING_TSA_URLS: 'https://primary.example/tsr,https://secondary.example/tsr',
    });
    const client = new TsaClient(env);
    const result = await client.timestamp(Buffer.from('payload'));
    expect(result.tsaUrl).toBe('https://secondary.example/tsr');
    expect(calls).toEqual(['https://primary.example/tsr', 'https://secondary.example/tsr']);
  });

  it('falls back when the first responds 200 with non-granted PKIStatus', async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (url: string) => {
      calls.push(url);
      // status=2 (rejection) on primary, granted on secondary.
      return tsrResponse(url.includes('primary') ? 2 : 0);
    }) as unknown as typeof globalThis.fetch;

    const env = makeEnv({
      PDF_SIGNING_TSA_URLS: 'https://primary.example/tsr,https://secondary.example/tsr',
    });
    const client = new TsaClient(env);
    const result = await client.timestamp(Buffer.from('payload'));
    expect(result.tsaUrl).toBe('https://secondary.example/tsr');
    expect(calls.length).toBe(2);
  });

  it('throws tsa_all_failed when every TSA fails', async () => {
    globalThis.fetch = jest.fn(async (url: string) => {
      if (url.includes('a.example')) return httpFailure(500);
      return httpFailure(503);
    }) as unknown as typeof globalThis.fetch;

    const env = makeEnv({
      PDF_SIGNING_TSA_URLS: 'https://a.example/tsr,https://b.example/tsr',
    });
    const client = new TsaClient(env);
    await expect(client.timestamp(Buffer.from('x'))).rejects.toThrow(/tsa_all_failed/);
  });

  it('throws tsa_not_configured when neither env var is set', async () => {
    const env = makeEnv({});
    const client = new TsaClient(env);
    expect(client.configured).toBe(false);
    await expect(client.timestamp(Buffer.from('x'))).rejects.toThrow('tsa_not_configured');
  });

  it('drops empty CSV entries (trailing commas / whitespace)', async () => {
    const calls: string[] = [];
    globalThis.fetch = jest.fn(async (url: string) => {
      calls.push(url);
      return tsrResponse(0);
    }) as unknown as typeof globalThis.fetch;
    const env = makeEnv({
      PDF_SIGNING_TSA_URLS: ' https://only.example/tsr , , ',
    });
    const client = new TsaClient(env);
    const result = await client.timestamp(Buffer.from('payload'));
    expect(result.tsaUrl).toBe('https://only.example/tsr');
    expect(calls).toEqual(['https://only.example/tsr']);
  });
});
