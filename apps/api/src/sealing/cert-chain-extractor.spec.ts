import forge from 'node-forge';
import { parseCertChainFromCms } from './cert-chain-extractor';

/**
 * Build a self-signed cert + a CMS detached signature over `data` using
 * node-forge, then return the CMS as a forge Asn1 tree. We purposely
 * include AIA + CRL DP extensions on the cert so the extractor's
 * URL-pulling code paths run.
 */
function buildSelfSignedCmsAsn1(data: Buffer): {
  cmsAsn1: forge.asn1.Asn1;
  expectedSubject: string;
  expectedOcsp: ReadonlyArray<string>;
  expectedCrl: ReadonlyArray<string>;
} {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
  const attrs = [
    { name: 'commonName', value: 'Seald Test' },
    { name: 'countryName', value: 'US' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  // AIA + CRL DP extensions. node-forge encodes these for us when we
  // pass `value: <ASN.1>` directly; the simplest stable path is to
  // pre-build the ASN.1 with the DER values we want to surface.
  const asn1 = forge.asn1;
  const aiaExt = {
    name: 'authorityInfoAccess',
    id: '1.3.6.1.5.5.7.1.1',
    value: asn1
      .toDer(
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
          asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
            asn1.create(
              asn1.Class.UNIVERSAL,
              asn1.Type.OID,
              false,
              asn1.oidToDer('1.3.6.1.5.5.7.48.1').getBytes(),
            ),
            // GeneralName: tag 6 = uniformResourceIdentifier (IMPLICIT IA5String).
            asn1.create(asn1.Class.CONTEXT_SPECIFIC, 6, false, 'http://ocsp.example/'),
          ]),
        ]),
      )
      .getBytes(),
  };
  const crlExt = {
    name: 'cRLDistributionPoints',
    id: '2.5.29.31',
    value: asn1
      .toDer(
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
          asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
            // distributionPoint [0]
            asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
              // fullName [0] -> GeneralNames
              asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
                asn1.create(asn1.Class.CONTEXT_SPECIFIC, 6, false, 'http://crl.example/test.crl'),
              ]),
            ]),
          ]),
        ]),
      )
      .getBytes(),
  };
  cert.setExtensions([aiaExt, crlExt]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(data.toString('binary'));
  p7.addCertificate(cert);
  p7.addSigner({
    key: keys.privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256 as string,
    // node-forge's typings declare `value: string | undefined`, but the
    // runtime accepts a Date for `signingTime`. Cast through `unknown` to
    // narrow without bleeding `any` into the test signature.
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType as string, value: forge.pki.oids.data as string },
      { type: forge.pki.oids.messageDigest as string },
      {
        type: forge.pki.oids.signingTime as string,
        value: new Date() as unknown as string,
      },
    ],
  });
  p7.sign({ detached: true });
  const cmsAsn1 = p7.toAsn1();

  return {
    cmsAsn1,
    expectedSubject: 'CN=Seald Test, C=US',
    expectedOcsp: ['http://ocsp.example/'],
    expectedCrl: ['http://crl.example/test.crl'],
  };
}

describe('parseCertChainFromCms', () => {
  it('extracts the embedded certificate with subject DN, OCSP and CRL URLs', () => {
    const { cmsAsn1, expectedOcsp, expectedCrl } = buildSelfSignedCmsAsn1(
      Buffer.from('hello world'),
    );

    const certs = parseCertChainFromCms(cmsAsn1);
    expect(certs.length).toBeGreaterThanOrEqual(1);
    const c = certs[0]!;
    expect(c.der).toBeInstanceOf(Buffer);
    expect(c.der.length).toBeGreaterThan(0);
    expect(c.subjectDn).toContain('Seald Test');
    expect(c.issuerDn).toContain('Seald Test');
    expect(c.serialHex).toBe('01');
    expect(c.notBefore).toBeInstanceOf(Date);
    expect(c.notAfter).toBeInstanceOf(Date);
    expect(c.ocspUrls).toEqual(expectedOcsp);
    expect(c.crlUrls).toEqual(expectedCrl);
  });

  it('returns [] when the ContentInfo OID is not signedData', () => {
    const asn1 = forge.asn1;
    const fake = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      // Random OID — not signedData.
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('1.2.3').getBytes()),
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, []),
    ]);
    expect(parseCertChainFromCms(fake)).toEqual([]);
  });
});
