import forge from 'node-forge';
import { withNativeRsaSign } from '../p12-tsa-signer';

/**
 * The CMS signature's RSA operation moved from forge's pure-JS math to
 * node:crypto (AWS exit plan, WS-0: CPU budget on the edge function).
 * PKCS#1 v1.5 is deterministic, so the native path must reproduce forge's
 * signature byte for byte; anything else would change sealed PDFs.
 */
describe('withNativeRsaSign', () => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });

  it.each(['sha256', 'sha384', 'sha512'] as const)(
    'matches forge RSASSA-PKCS1-v1_5 output for %s',
    (alg) => {
      const digest = () => {
        const md = forge.md[alg].create();
        md.update('signed attributes DER stand-in', 'utf8');
        return md;
      };
      const expected = keys.privateKey.sign(digest(), 'RSASSA-PKCS1-V1_5');
      const actual = withNativeRsaSign(keys.privateKey).sign(digest(), 'RSASSA-PKCS1-V1_5');
      expect(Buffer.from(actual, 'binary').toString('hex')).toBe(
        Buffer.from(expected, 'binary').toString('hex'),
      );
      expect(keys.publicKey.verify(digest().digest().getBytes(), actual)).toBe(true);
    },
  );

  it('keeps the key fields forge code compares against the certificate', () => {
    const fast = withNativeRsaSign(keys.privateKey);
    expect(fast.n.compareTo(keys.publicKey.n)).toBe(0);
    expect(fast.e.compareTo(keys.publicKey.e)).toBe(0);
  });

  it('signs a pkcs7 SignedData that verifies, through forge itself', () => {
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date(Date.now() - 60_000);
    cert.validity.notAfter = new Date(Date.now() + 86_400_000);
    cert.setSubject([{ name: 'commonName', value: 'native-rsa-test' }]);
    cert.setIssuer([{ name: 'commonName', value: 'native-rsa-test' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const build = (key: forge.pki.rsa.PrivateKey) => {
      const p7 = forge.pkcs7.createSignedData();
      p7.content = forge.util.createBuffer('pdf byte range');
      p7.addCertificate(cert);
      p7.addSigner({
        key,
        certificate: cert,
        digestAlgorithm: forge.pki.oids.sha256 as string,
        authenticatedAttributes: [
          { type: forge.pki.oids.contentType as string, value: forge.pki.oids.data as string },
          { type: forge.pki.oids.messageDigest as string },
        ],
      });
      p7.sign({ detached: true });
      return (p7 as unknown as { signers: Array<{ signature: string }> }).signers[0]!.signature;
    };
    expect(build(withNativeRsaSign(keys.privateKey))).toBe(build(keys.privateKey));
  });
});
