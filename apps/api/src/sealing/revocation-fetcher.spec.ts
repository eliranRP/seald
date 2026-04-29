import forge from 'node-forge';
import type { CertWithMetadata } from './cert-chain-extractor';
import { RevocationFetcher } from './revocation-fetcher';

/**
 * Build a self-signed cert and return both the parsed metadata that the
 * fetcher consumes AND the underlying `forge.pki.Certificate` so the
 * tests can construct an issuer-key/issuer-name hash for the OCSP path.
 *
 * We deliberately reuse the same cert as both subject + issuer (self-
 * signed) — the fetcher's behaviour is not affected by which cert plays
 * which role; it only cares about the AIA / CRL URL lists.
 */
function makeCert(opts: {
  ocspUrls?: ReadonlyArray<string>;
  crlUrls?: ReadonlyArray<string>;
}): CertWithMetadata {
  const keys = forge.pki.rsa.generateKeyPair(1024); // small keys for test speed
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '0a';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
  const attrs = [{ name: 'commonName', value: 'Test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const der = Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary');
  return {
    der,
    subjectDn: 'CN=Test',
    issuerDn: 'CN=Test',
    serialHex: '0a',
    notBefore: cert.validity.notBefore,
    notAfter: cert.validity.notAfter,
    ocspUrls: opts.ocspUrls ?? [],
    crlUrls: opts.crlUrls ?? [],
  };
}

describe('RevocationFetcher', () => {
  let fetcher: RevocationFetcher;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetcher = new RevocationFetcher();
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchOcsp', () => {
    it('returns null when the cert has no AIA OCSP URL', async () => {
      const cert = makeCert({ ocspUrls: [] });
      const issuer = makeCert({});
      const out = await fetcher.fetchOcsp(cert, issuer);
      expect(out).toBeNull();
    });

    it('POSTs to the responder and returns the response body on success', async () => {
      const cert = makeCert({ ocspUrls: ['http://ocsp.example/'] });
      const issuer = cert; // self-signed
      // A valid-looking OCSP response: just a SEQUENCE so forge.fromDer
      // doesn't reject it during the fetcher's sanity check.
      const stubResp = Buffer.from(
        forge.asn1
          .toDer(
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
              forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
            ]),
          )
          .getBytes(),
        'binary',
      );

      const fetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          stubResp.buffer.slice(stubResp.byteOffset, stubResp.byteOffset + stubResp.byteLength),
      });
      globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

      const out = await fetcher.fetchOcsp(cert, issuer);
      expect(out).not.toBeNull();
      expect(out!.equals(stubResp)).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://ocsp.example/');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/ocsp-request');
    });

    it('returns null on HTTP error', async () => {
      const cert = makeCert({ ocspUrls: ['http://ocsp.example/'] });
      const issuer = cert;
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }) as unknown as typeof globalThis.fetch;
      const out = await fetcher.fetchOcsp(cert, issuer);
      expect(out).toBeNull();
    });

    it('returns null on transport error', async () => {
      const cert = makeCert({ ocspUrls: ['http://ocsp.example/'] });
      const issuer = cert;
      globalThis.fetch = jest
        .fn()
        .mockRejectedValue(new Error('boom')) as unknown as typeof globalThis.fetch;
      const out = await fetcher.fetchOcsp(cert, issuer);
      expect(out).toBeNull();
    });
  });

  describe('fetchCrl', () => {
    it('returns null when the cert has no CRL DPs', async () => {
      const cert = makeCert({ crlUrls: [] });
      expect(await fetcher.fetchCrl(cert)).toBeNull();
    });

    it('GETs the first reachable DP and returns the response bytes', async () => {
      const cert = makeCert({ crlUrls: ['http://crl1.example/test.crl'] });
      const stub = Buffer.from(
        forge.asn1
          .toDer(
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
              forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
            ]),
          )
          .getBytes(),
        'binary',
      );
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          stub.buffer.slice(stub.byteOffset, stub.byteOffset + stub.byteLength),
      }) as unknown as typeof globalThis.fetch;
      const out = await fetcher.fetchCrl(cert);
      expect(out).not.toBeNull();
      expect(out!.equals(stub)).toBe(true);
    });

    it('skips a failing DP and tries the next', async () => {
      const cert = makeCert({
        crlUrls: ['http://crl1.example/down.crl', 'http://crl2.example/up.crl'],
      });
      const stub = Buffer.from(
        forge.asn1
          .toDer(
            forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
              forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
            ]),
          )
          .getBytes(),
        'binary',
      );
      const calls: string[] = [];
      globalThis.fetch = jest.fn(async (url: string) => {
        calls.push(url);
        if (url.includes('down')) return { ok: false, status: 404 };
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            stub.buffer.slice(stub.byteOffset, stub.byteOffset + stub.byteLength),
        };
      }) as unknown as typeof globalThis.fetch;
      const out = await fetcher.fetchCrl(cert);
      expect(out).not.toBeNull();
      expect(calls).toEqual(['http://crl1.example/down.crl', 'http://crl2.example/up.crl']);
    });
  });
});
