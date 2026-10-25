import forge from 'node-forge';
import { withNativeDigests, withNativeRsaSign } from '../p12-tsa-signer';

/**
 * The CMS signature's RSA operation moved from forge's pure-JS math to
 * node:crypto (CPU budget on the Supabase edge function). PKCS#1 v1.5 is
 * deterministic, so the native path must reproduce forge's signature byte
 * for byte; anything else would change sealed PDFs.
 */
describe('withNativeRsaSign', () => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });

  function selfSigned(): forge.pki.Certificate {
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 60_000);
    cert.validity.notAfter = new Date(Date.now() + 86_400_000);
    cert.setSubject([{ name: 'commonName', value: 'native-rsa-test' }]);
    cert.setIssuer([{ name: 'commonName', value: 'native-rsa-test' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    return cert;
  }
  const cert = selfSigned();
  const signingTime = new Date('2026-10-25T00:00:00Z');

  /** Detached SignedData over a fixed content; returns the signer's signature bytes. */
  function signature(key: forge.pki.rsa.PrivateKey, capture: boolean): string {
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer('pdf byte range');
    p7.addCertificate(cert);
    p7.addSigner({
      key,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256 as string,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType as string, value: forge.pki.oids.data as string },
        { type: forge.pki.oids.signingTime as string, value: signingTime as unknown as string },
        { type: forge.pki.oids.messageDigest as string },
      ],
    });
    if (capture) withNativeDigests(() => p7.sign({ detached: true }));
    else p7.sign({ detached: true });
    return (p7 as unknown as { signers: Array<{ signature: string }> }).signers[0]!.signature;
  }

  it('signs natively and matches forge byte for byte', () => {
    const native = withNativeRsaSign(keys.privateKey);
    const expected = signature(keys.privateKey, false);
    const signSpy = jest.spyOn(keys.privateKey, 'sign');
    try {
      expect(signature(native, true)).toBe(expected);
      // The forge key's own RSA math was not used.
      expect(signSpy).not.toHaveBeenCalled();
    } finally {
      signSpy.mockRestore();
    }
  });

  it('falls back to forge (same bytes) when the digest input was not captured', () => {
    expect(signature(withNativeRsaSign(keys.privateKey), false)).toBe(
      signature(keys.privateKey, false),
    );
  });

  /** A SHA-256 digest as `p7.sign()` sees it under withNativeDigests. */
  const nativeSha256 = () => withNativeDigests(() => forge.md.sha256.create());

  it('falls back to forge when the captured bytes do not hash to the digest', () => {
    const md = nativeSha256();
    md.update('what the recorder saw');
    const other = forge.md.sha256.create();
    other.update('what the digest really covers');
    md.digest = () => other.digest();
    expect(withNativeRsaSign(keys.privateKey).sign(md, 'RSASSA-PKCS1-V1_5')).toBe(
      keys.privateKey.sign(other, 'RSASSA-PKCS1-V1_5'),
    );
  });

  it('does not record past the size cap (content digests), so signing falls back', () => {
    const md = nativeSha256();
    md.update('x'.repeat(70 * 1024));
    const signSpy = jest.spyOn(keys.privateKey, 'sign');
    try {
      withNativeRsaSign(keys.privateKey).sign(md, 'RSASSA-PKCS1-V1_5');
      expect(signSpy).toHaveBeenCalledTimes(1);
    } finally {
      signSpy.mockRestore();
    }
  });

  it('native digests equal forge digests, including after start() and repeated digest()', () => {
    const forgeMd = forge.md.sha256.create();
    let nativeMd: forge.md.MessageDigest | undefined;
    withNativeDigests(() => {
      nativeMd = forge.md.sha256.create();
    });
    for (const md of [forgeMd, nativeMd!]) {
      md.update('first, discarded');
      (md as unknown as { start(): void }).start();
      md.update('pdf byte range ');
      md.update('héllo', 'utf8');
    }
    expect(nativeMd!.algorithm).toBe('sha256');
    expect(nativeMd!.digest().toHex()).toBe(forgeMd.digest().toHex());
    expect(nativeMd!.digest().toHex()).toBe(forgeMd.digest().toHex());
  });

  it('restores the forge digest factories after withNativeDigests, even on a throw', () => {
    const create = forge.md.sha256.create;
    expect(() =>
      withNativeDigests(() => {
        expect(forge.md.sha256.create).not.toBe(create);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(forge.md.sha256.create).toBe(create);
  });

  it('keeps the key fields forge code compares against the certificate', () => {
    const fast = withNativeRsaSign(keys.privateKey);
    expect(fast.n.compareTo(keys.publicKey.n)).toBe(0);
    expect(fast.e.compareTo(keys.publicKey.e)).toBe(0);
  });
});
