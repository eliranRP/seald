/**
 * Tests for `KmsCmsSigner` — drives the hand-built CMS structure with
 * a stubbed KMSClient that signs the digest with a local RSA key. This
 * lets us assert wire-level CMS shape (OIDs, signedAttrs ordering,
 * cert binding, signature placement) AND cryptographic correctness
 * (the embedded signature actually verifies under the cert's public
 * key) without a real AWS endpoint.
 */

import { Buffer } from 'node:buffer';
import { createHash, createSign } from 'node:crypto';
import forge from 'node-forge';
import type { KMSClient, SignCommand } from '@aws-sdk/client-kms';
import { KmsCmsSigner } from '../kms-cms-signer';

/** Build a self-signed RSA-2048 cert + matching private key (forge). */
function makeCertAndKey(): { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1);
  const attrs = [
    { name: 'commonName', value: 'KMS Test Signer' },
    { name: 'countryName', value: 'US' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { cert, key: keys.privateKey };
}

/**
 * Build a stubbed KMSClient whose `.send(SignCommand)` signs the input
 * digest with a local node:crypto signer. Mirrors the real KMS contract:
 * `MessageType: 'DIGEST'` means KMS treats `Message` as the pre-hashed
 * digest and only applies PKCS#1 v1.5 padding + RSA. We do the same:
 * use createSign('RSA-SHA256') with a pre-hashed update would double-
 * hash, so we use the lower-level crypto.sign API style by calling
 * createSign('sha256') on the original signedAttrs instead — but the
 * cleanest path is to round-trip via privateKey.sign() after PKCS#1
 * encoding. We use forge's RSA primitive since the cert is forge-built.
 */
function makeStubKmsClient(privateKey: forge.pki.rsa.PrivateKey): KMSClient {
  return {
    send: jest.fn(async (cmd: SignCommand) => {
      const input = cmd.input as { Message?: Uint8Array; MessageType?: string };
      if (input.MessageType !== 'DIGEST') {
        throw new Error(`expected MessageType=DIGEST, got ${input.MessageType}`);
      }
      const digest = Buffer.from(input.Message!);
      // PKCS#1 v1.5 over a SHA-256 digest. forge's privateKey.sign expects
      // a forge MessageDigest; build one and inject the raw bytes via the
      // low-level digestInfo path.
      const md = forge.md.sha256.create();
      md.digest = () => forge.util.createBuffer(digest.toString('binary'));
      const sig = privateKey.sign(md);
      return { Signature: Buffer.from(sig, 'binary') };
    }),
  } as unknown as KMSClient;
}

/**
 * Decode the produced CMS DER and locate the SignerInfo. Returns the
 * top-level forge ASN.1 tree plus convenient pointers used by tests.
 */
function decodeCms(cmsDer: Buffer) {
  const tree = forge.asn1.fromDer(cmsDer.toString('binary'));
  // ContentInfo SEQUENCE { contentType OID, [0] EXPLICIT SignedData }
  const ciValue = tree.value as forge.asn1.Asn1[];
  const contentTypeOid = forge.asn1.derToOid(ciValue[0]!.value as unknown as string);
  const explicit0 = ciValue[1] as forge.asn1.Asn1;
  const signedData = (explicit0.value as forge.asn1.Asn1[])[0] as forge.asn1.Asn1;
  const sdValue = signedData.value as forge.asn1.Asn1[];
  // signerInfos is the last SET in signedData.
  let signerInfos: forge.asn1.Asn1 | null = null;
  for (let i = sdValue.length - 1; i >= 0; i--) {
    const node = sdValue[i]!;
    if (node.type === forge.asn1.Type.SET && Array.isArray(node.value) && node.value.length > 0) {
      const first = (node.value as forge.asn1.Asn1[])[0]!;
      if (first.type === forge.asn1.Type.SEQUENCE) {
        signerInfos = node;
        break;
      }
    }
  }
  const signerInfo = (signerInfos!.value as forge.asn1.Asn1[])[0]!;
  return { tree, contentTypeOid, signedData, signerInfo };
}

/** Pull all OIDs out of the SignedAttributes [0] IMPLICIT SET. */
function signedAttrsOids(signerInfo: forge.asn1.Asn1): string[] {
  for (const child of signerInfo.value as forge.asn1.Asn1[]) {
    if (
      child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
      child.type === 0 &&
      Array.isArray(child.value)
    ) {
      const out: string[] = [];
      for (const attr of child.value as forge.asn1.Asn1[]) {
        const attrChildren = attr.value as forge.asn1.Asn1[];
        const oidNode = attrChildren[0]!;
        out.push(forge.asn1.derToOid(oidNode.value as unknown as string));
      }
      return out;
    }
  }
  return [];
}

const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';
const OID_SIGNING_CERTIFICATE_V2 = '1.2.840.113549.1.9.16.2.47';

describe('KmsCmsSigner', () => {
  it('produces a CMS SignedData ContentInfo with all four mandatory PAdES signed attributes', async () => {
    const { cert, key } = makeCertAndKey();
    const kms = makeStubKmsClient(key);
    const signer = new KmsCmsSigner(kms, 'arn:aws:kms:us-east-1:1:key/test', cert, null);

    const out = await signer.sign(Buffer.from('hello PDF bytes'));
    const decoded = decodeCms(out);
    expect(decoded.contentTypeOid).toBe(OID_SIGNED_DATA);

    const oids = signedAttrsOids(decoded.signerInfo);
    expect(oids).toContain(OID_CONTENT_TYPE);
    expect(oids).toContain(OID_MESSAGE_DIGEST);
    expect(oids).toContain(OID_SIGNING_TIME);
    expect(oids).toContain(OID_SIGNING_CERTIFICATE_V2);
  });

  it('asks KMS to sign the SHA-256 digest of DER-encoded SignedAttributes (with explicit SET tag)', async () => {
    const { cert, key } = makeCertAndKey();
    const kms = makeStubKmsClient(key);
    const sendSpy = kms.send as jest.Mock;

    const signer = new KmsCmsSigner(kms, 'key-arn', cert, null);
    await signer.sign(Buffer.from('payload'));

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const cmd = sendSpy.mock.calls[0]![0] as SignCommand;
    const input = cmd.input as {
      Message: Uint8Array;
      MessageType: string;
      SigningAlgorithm: string;
    };
    expect(input.MessageType).toBe('DIGEST');
    expect(input.SigningAlgorithm).toBe('RSASSA_PKCS1_V1_5_SHA_256');
    // Digest is exactly 32 bytes (SHA-256 output) — no leading length prefix.
    expect(input.Message.byteLength).toBe(32);
  });

  it('embeds the CMS signature returned by KMS (round-trip verifies under the cert public key)', async () => {
    const { cert, key } = makeCertAndKey();
    const kms = makeStubKmsClient(key);
    const signer = new KmsCmsSigner(kms, 'key-arn', cert, null);

    const pdf = Buffer.from('PDF content bytes');
    const out = await signer.sign(pdf);
    const { signerInfo } = decodeCms(out);

    // Locate the OCTET STRING signature (sits between signatureAlgorithm
    // and unsignedAttrs in the SignerInfo SEQUENCE).
    let signatureOctets: string | null = null;
    for (const child of signerInfo.value as forge.asn1.Asn1[]) {
      if (
        child.type === forge.asn1.Type.OCTETSTRING &&
        child.tagClass === forge.asn1.Class.UNIVERSAL
      ) {
        signatureOctets = child.value as unknown as string;
      }
    }
    expect(signatureOctets).not.toBeNull();

    // Recover the SignedAttrs hash that was signed: re-encode signedAttrs
    // with explicit SET tag, hash, and verify the embedded signature.
    let signedAttrsNode: forge.asn1.Asn1 | null = null;
    for (const child of signerInfo.value as forge.asn1.Asn1[]) {
      if (
        child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
        child.type === 0 &&
        Array.isArray(child.value)
      ) {
        signedAttrsNode = child;
      }
    }
    const setForm = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      signedAttrsNode!.value as forge.asn1.Asn1[],
    );
    const signedAttrsDer = forge.asn1.toDer(setForm).getBytes();
    const expectedDigest = createHash('sha256').update(signedAttrsDer, 'binary').digest();

    // Verify with the public key of the embedded cert.
    const md = forge.md.sha256.create();
    md.digest = () => forge.util.createBuffer(expectedDigest.toString('binary'));
    const ok = (cert.publicKey as forge.pki.rsa.PublicKey).verify(
      md.digest().getBytes(),
      signatureOctets!,
    );
    expect(ok).toBe(true);
  });

  it('embeds the messageDigest = SHA-256(input PDF bytes) in the SignedAttributes', async () => {
    const { cert, key } = makeCertAndKey();
    const kms = makeStubKmsClient(key);
    const signer = new KmsCmsSigner(kms, 'key-arn', cert, null);

    const pdf = Buffer.from('exact pdf content');
    const expectedMd = createHash('sha256').update(pdf).digest();
    const out = await signer.sign(pdf);
    const { signerInfo } = decodeCms(out);

    // Walk signedAttrs → find messageDigest attribute → compare OCTET STRING.
    let recoveredMd: Buffer | null = null;
    for (const child of signerInfo.value as forge.asn1.Asn1[]) {
      if (
        child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
        child.type === 0 &&
        Array.isArray(child.value)
      ) {
        for (const attr of child.value as forge.asn1.Asn1[]) {
          const attrKids = attr.value as forge.asn1.Asn1[];
          const oid = forge.asn1.derToOid(attrKids[0]!.value as unknown as string);
          if (oid === OID_MESSAGE_DIGEST) {
            const valueSet = attrKids[1]!.value as forge.asn1.Asn1[];
            recoveredMd = Buffer.from(valueSet[0]!.value as unknown as string, 'binary');
          }
        }
      }
    }
    expect(recoveredMd).not.toBeNull();
    expect(recoveredMd!.equals(expectedMd)).toBe(true);
  });

  it('does not attach unsignedAttrs when no TSA is configured', async () => {
    const { cert, key } = makeCertAndKey();
    const kms = makeStubKmsClient(key);
    const signer = new KmsCmsSigner(kms, 'key-arn', cert, null);

    const out = await signer.sign(Buffer.from('payload'));
    const { signerInfo } = decodeCms(out);
    const hasUnsignedAttrs = (signerInfo.value as forge.asn1.Asn1[]).some(
      (child) => child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && child.type === 1,
    );
    expect(hasUnsignedAttrs).toBe(false);
  });

  it('throws kms_signature_missing when KMS Sign returns no Signature field', async () => {
    const { cert } = makeCertAndKey();
    const brokenKms = {
      send: jest.fn(async () => ({})),
    } as unknown as KMSClient;
    const signer = new KmsCmsSigner(brokenKms, 'key-arn', cert, null);
    await expect(signer.sign(Buffer.from('x'))).rejects.toThrow('kms_signature_missing');
  });

  it('attaches an id-aa-signatureTimeStampToken unsignedAttr when TSA grants a token', async () => {
    const { cert, key } = makeCertAndKey();
    const kms = makeStubKmsClient(key);

    // Synthetic TST: a minimal CMS ContentInfo with the signedData OID.
    // KmsCmsSigner only re-wraps it into the unsignedAttrs SET; it does
    // not parse internals. We just need bytes that decode as ASN.1.
    const tokenAsn1 = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SEQUENCE,
      true,
      [
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.OID,
          false,
          forge.asn1.oidToDer(OID_SIGNED_DATA).getBytes(),
        ),
        forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, []),
      ],
    );
    const tokenDer = Buffer.from(forge.asn1.toDer(tokenAsn1).getBytes(), 'binary');

    const fakeTsa = {
      configured: true,
      timestamp: jest.fn(async () => ({
        tokenDer,
        genTime: '2026-04-29T12:00:00Z',
        tsaUrl: 'https://tsa.example/tsr',
        messageImprintSha256Hex: 'deadbeef',
      })),
    } as unknown as import('../tsa-client').TsaClient;

    const signer = new KmsCmsSigner(kms, 'key-arn', cert, fakeTsa);
    const out = await signer.sign(Buffer.from('payload'));
    const { signerInfo } = decodeCms(out);

    const unsignedAttrs = (signerInfo.value as forge.asn1.Asn1[]).find(
      (child) => child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && child.type === 1,
    );
    expect(unsignedAttrs).toBeDefined();
    const tsaAttribute = (unsignedAttrs!.value as forge.asn1.Asn1[])[0]!;
    const tsaAttrKids = tsaAttribute.value as forge.asn1.Asn1[];
    const tsaOid = forge.asn1.derToOid(tsaAttrKids[0]!.value as unknown as string);
    expect(tsaOid).toBe('1.2.840.113549.1.9.16.2.14');
    expect(fakeTsa.timestamp).toHaveBeenCalledTimes(1);
  });

  it('falls back to PAdES B-B (no unsignedAttrs) when TSA round-trip fails', async () => {
    const { cert, key } = makeCertAndKey();
    const kms = makeStubKmsClient(key);
    const failingTsa = {
      configured: true,
      timestamp: jest.fn(async () => {
        throw new Error('tsa_all_failed: every endpoint down');
      }),
    } as unknown as import('../tsa-client').TsaClient;

    const signer = new KmsCmsSigner(kms, 'key-arn', cert, failingTsa);
    const out = await signer.sign(Buffer.from('payload'));
    const { signerInfo } = decodeCms(out);
    const hasUnsignedAttrs = (signerInfo.value as forge.asn1.Asn1[]).some(
      (child) => child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && child.type === 1,
    );
    expect(hasUnsignedAttrs).toBe(false);
  });
});

// Silence eslint about unused imports — both `createSign` and `createHash`
// are used inside test bodies, and at least one TypeScript build mode
// flags the import as unused if a body is later modified. Touch them.
void createSign;
