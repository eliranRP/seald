import { Injectable, Logger } from '@nestjs/common';
import { Signer } from '@signpdf/utils';
import forge from 'node-forge';
import type { AppEnv } from '../config/env.schema';
import { TsaClient } from './tsa-client';

/**
 * @signpdf-compatible Signer that produces a PAdES-B-T compliant CMS
 * SignedData: P12-backed signature + RFC 3161 timestamp embedded as an
 * unsigned attribute on the SignerInfo.
 *
 * Flow per .sign() invocation:
 *   1. Build a standard detached PKCS#7 SignedData with node-forge,
 *      identical to @signpdf/signer-p12's output.
 *   2. Extract the SignerInfo's encryptedDigest (the actual signature bytes).
 *   3. Query the TSA with sha256(encryptedDigest) → receive a
 *      TimeStampToken (a CMS ContentInfo).
 *   4. Walk the PKCS#7 ASN.1 tree and append an unsignedAttrs [1] IMPLICIT
 *      field on the SignerInfo containing the TST under OID
 *      1.2.840.113549.1.9.16.2.14 (id-aa-timeStampToken / RFC 3161
 *      signatureTimeStampToken).
 *   5. Re-encode DER and return.
 *
 * The output is embeddable in a PDF via @signpdf/signpdf and any verifier
 * (Adobe Reader, DSS, pdfsig) will pick up both the signature AND the
 * timestamp from a single /Contents blob — no sidecar file required.
 */
@Injectable()
export class P12TsaSigner extends Signer {
  private readonly logger = new Logger(P12TsaSigner.name);
  private readonly p12Buffer: Buffer;
  private readonly passphrase: string;

  constructor(
    p12Buffer: Buffer,
    passphrase: string,
    private readonly tsa: TsaClient,
  ) {
    super();
    this.p12Buffer = p12Buffer;
    this.passphrase = passphrase;
  }

  override async sign(pdfBuffer: Buffer, signingTime?: Date): Promise<Buffer> {
    // ---- 1. P12 → cert + private key ----
    const oidCertBag = forge.pki.oids.certBag as string;
    const oidKeyBag = forge.pki.oids.pkcs8ShroudedKeyBag as string;
    const p12Asn1 = forge.asn1.fromDer(this.p12Buffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, this.passphrase);
    const certBags = p12.getBags({ bagType: oidCertBag })[oidCertBag]!;
    const keyBags = p12.getBags({ bagType: oidKeyBag })[oidKeyBag]!;
    const privateKey = keyBags[0]!.key as forge.pki.rsa.PrivateKey;

    // ---- 2. Build PKCS#7 SignedData ----
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'));

    let certificate: forge.pki.Certificate | undefined;
    for (const bag of certBags) {
      const cert = bag.cert!;
      p7.addCertificate(cert);
      const pub = cert.publicKey as forge.pki.rsa.PublicKey;
      if (privateKey.n.compareTo(pub.n) === 0 && privateKey.e.compareTo(pub.e) === 0) {
        certificate = cert;
      }
    }
    if (!certificate) {
      throw new Error('p12_cert_key_mismatch: no cert in the P12 matches the private key');
    }
    p7.addSigner({
      key: privateKey,
      certificate,
      digestAlgorithm: forge.pki.oids.sha256 as string,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType as string,
          value: forge.pki.oids.data as string,
        },
        {
          type: forge.pki.oids.signingTime as string,
          value: (signingTime ?? new Date()) as unknown as string,
        },
        { type: forge.pki.oids.messageDigest as string },
      ],
    });
    p7.sign({ detached: true });

    // ---- 3. Extract encryptedDigest + get TST from TSA ----
    // node-forge's typings don't expose the `signers` property even though
    // it exists at runtime. Bridge through `unknown` (per react-best-
    // practices skill rule 3.2 — prefer unknown + narrowing over `any`).
    const signerInfos = (p7 as unknown as { signers: ReadonlyArray<{ signature: string }> })
      .signers;
    const encryptedDigest = Buffer.from(signerInfos[0]!.signature, 'binary');
    this.logger.log(
      `requesting TSA timestamp for encryptedDigest (${encryptedDigest.length} bytes)`,
    );
    const { tokenDer, genTime } = await this.tsa.timestamp(encryptedDigest);
    this.logger.log(`TSA granted timestamp at ${genTime || '(unknown genTime)'}`);

    // ---- 4. Inject TST as unsignedAttr on SignerInfo ----
    const pkcs7Asn1 = p7.toAsn1();
    const signerInfoSeq = findFirstSignerInfo(pkcs7Asn1);
    if (!signerInfoSeq) {
      throw new Error('signer_info_not_found_in_pkcs7');
    }

    const tsaAttribute = buildTimestampAttribute(tokenDer);
    const unsignedAttrs = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 1, true, [
      tsaAttribute,
    ]);
    (signerInfoSeq.value as forge.asn1.Asn1[]).push(unsignedAttrs);

    // ---- 5. Re-encode ----
    const der = forge.asn1.toDer(pkcs7Asn1).getBytes();
    return Buffer.from(der, 'binary');
  }
}

/**
 * Factory helper kept outside the class so SealingModule can `new` it
 * when both the P12 env vars and a TSA URL are present.
 */
export function createP12TsaSigner(env: AppEnv, tsa: TsaClient, p12Bytes: Buffer): P12TsaSigner {
  if (!env.PDF_SIGNING_LOCAL_P12_PASS) {
    throw new Error('P12TsaSigner requires PDF_SIGNING_LOCAL_P12_PASS');
  }
  return new P12TsaSigner(p12Bytes, env.PDF_SIGNING_LOCAL_P12_PASS, tsa);
}

// --------------------------------------------------------------------
// ASN.1 helpers
// --------------------------------------------------------------------

const OID_TIMESTAMP_TOKEN = '1.2.840.113549.1.9.16.2.14';

/**
 * Walk the PKCS#7 ASN.1 tree and return the first SignerInfo SEQUENCE:
 *
 *   ContentInfo
 *     SEQUENCE
 *       contentType       OID   (1.2.840.113549.1.7.2 id-signedData)
 *       content          [0] EXPLICIT
 *         SignedData
 *           SEQUENCE
 *             version                        INTEGER
 *             digestAlgorithms               SET
 *             encapContentInfo               SEQUENCE
 *             certificates                  [0] IMPLICIT  (optional)
 *             crls                          [1] IMPLICIT  (optional)
 *             signerInfos                    SET  ← we want the first child here
 */
function findFirstSignerInfo(pkcs7: forge.asn1.Asn1): forge.asn1.Asn1 | null {
  const ci = pkcs7.value as forge.asn1.Asn1[];
  const explicit0 = ci[1];
  if (!explicit0) return null;
  const signedData = (explicit0.value as forge.asn1.Asn1[])[0];
  if (!signedData) return null;
  const sd = signedData.value as forge.asn1.Asn1[];
  // signerInfos is the final SET. Walk backwards until we find one whose
  // children are SEQUENCEs (the SignerInfo entries).
  for (let i = sd.length - 1; i >= 0; i--) {
    const node = sd[i]!;
    if (node.type === forge.asn1.Type.SET && Array.isArray(node.value) && node.value.length > 0) {
      const first = (node.value as forge.asn1.Asn1[])[0]!;
      if (first.type === forge.asn1.Type.SEQUENCE) return first;
    }
  }
  return null;
}

/**
 * Attribute ::= SEQUENCE {
 *   attrType   OBJECT IDENTIFIER,   -- id-aa-timeStampToken
 *   attrValues SET OF AttributeValue -- contains the TST ContentInfo
 * }
 */
function buildTimestampAttribute(tokenDer: Buffer): forge.asn1.Asn1 {
  const tokenAsn1 = forge.asn1.fromDer(tokenDer.toString('binary'));
  return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.OID,
      false,
      forge.asn1.oidToDer(OID_TIMESTAMP_TOKEN).getBytes(),
    ),
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [tokenAsn1]),
  ]);
}
