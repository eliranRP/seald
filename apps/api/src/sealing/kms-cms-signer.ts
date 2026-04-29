import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { KMSClient, SignCommand } from '@aws-sdk/client-kms';
import { Signer } from '@signpdf/utils';
import forge from 'node-forge';
import { TsaClient } from './tsa-client';

/**
 * @signpdf-compatible signer that produces a PAdES-B-T compliant CMS
 * SignedData with the signature operation delegated to AWS KMS, plus an
 * optional embedded RFC 3161 timestamp.
 *
 * Why a hand-built CMS?
 * ---------------------
 * node-forge's `pkcs7.createSignedData()` + `addSigner()` + `.sign()`
 * pipeline computes the SignedAttributes digest *internally* and signs
 * it with a local RSA private key. With KMS the private key never
 * leaves AWS — we can only request a signature over a digest we
 * provide. So the path is:
 *
 *   1. Build the SignedAttributes ASN.1 tree (contentType, messageDigest,
 *      signingTime, signing-certificate-v2).
 *   2. Re-encode with the explicit SET-OF tag (RFC 5652 §5.4) and SHA-256
 *      it — this is the digest KMS signs.
 *   3. KMS Sign(digest, RSASSA_PKCS1_V1_5_SHA_256).
 *   4. Hand-assemble the full ContentInfo→SignedData→SignerInfo tree with
 *      the KMS-returned signature bytes in `signature` (OCTET STRING).
 *   5. Optionally request an RFC 3161 timestamp over the signature and
 *      attach it as `id-aa-signatureTimeStampToken` on the SignerInfo's
 *      unsignedAttrs (`[1] IMPLICIT`) — same shape as P12TsaSigner.
 *   6. DER-encode and return.
 *
 * Callers wrap the output via @signpdf/signpdf, which embeds it as the
 * detached PKCS#7 blob in the PDF's /Contents.
 *
 * Compliance:
 *   - PAdES baseline (ETSI EN 319 142-1) — §6.2 detached signedData,
 *     SHA-256 digest, signing-cert-v2 attribute.
 *   - cryptography-expert §8 (KMS for production keys),
 *     §11 (RFC 3161 trusted time anchor),
 *     §14 (RFC 5035 ESS attribute).
 */
export class KmsCmsSigner extends Signer {
  private readonly logger = new Logger(KmsCmsSigner.name);

  constructor(
    private readonly kmsClient: KMSClient,
    private readonly keyId: string,
    private readonly certificate: forge.pki.Certificate,
    private readonly tsa: TsaClient | null,
  ) {
    super();
  }

  override async sign(pdfBuffer: Buffer, signingTime?: Date): Promise<Buffer> {
    // ---- 1. messageDigest = SHA-256(detached content). For PAdES
    //         this content is the bytes covered by /ByteRange minus
    //         the placeholder /Contents — @signpdf has already
    //         arranged the buffer so we just hash what we got.
    const messageDigest = createHash('sha256').update(pdfBuffer).digest();
    const time = signingTime ?? new Date();

    // ---- 2. Build SignedAttributes (the SET that gets signed).
    const signedAttrs = buildSignedAttributes(this.certificate, messageDigest, time);

    // ---- 3. RFC 5652 §5.4: when computing the digest for the signature,
    //         the SignedAttributes are re-encoded with the explicit SET
    //         tag (0x31), NOT the implicit [0] tag they carry inside the
    //         SignerInfo. Build a synthetic SET node and DER-encode it.
    const signedAttrsForHash = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      signedAttrs.value as forge.asn1.Asn1[],
    );
    const signedAttrsDer = Buffer.from(forge.asn1.toDer(signedAttrsForHash).getBytes(), 'binary');
    const signedAttrsDigest = createHash('sha256').update(signedAttrsDer).digest();

    // ---- 4. KMS Sign(digest). MessageType=DIGEST means KMS signs the
    //         given bytes verbatim — it does NOT hash again. The key
    //         must be RSA_3072 SIGN_VERIFY (cryptography-expert §8).
    this.logger.log(
      `KMS sign request: key=${this.keyId} digest=${signedAttrsDigest.toString('hex').slice(0, 12)}…`,
    );
    const signOut = await this.kmsClient.send(
      new SignCommand({
        KeyId: this.keyId,
        Message: signedAttrsDigest,
        MessageType: 'DIGEST',
        SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
      }),
    );
    if (!signOut.Signature) {
      throw new Error('kms_signature_missing: KMS Sign returned no Signature field');
    }
    const signatureBytes = Buffer.from(signOut.Signature);

    // ---- 5. Optional TSA timestamp over the signature. Best-effort —
    //         falls through to PAdES B-B on TSA outage (same contract
    //         as P12TsaSigner).
    let tsaTokenDer: Buffer | null = null;
    if (this.tsa && this.tsa.configured) {
      try {
        const result = await this.tsa.timestamp(signatureBytes);
        tsaTokenDer = result.tokenDer;
        this.logger.log(`TSA granted timestamp at ${result.genTime || '(unknown genTime)'}`);
      } catch (err) {
        this.logger.warn(
          `TSA round-trip failed; degrading to PAdES B-B: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ---- 6. Hand-build the full ContentInfo → SignedData tree.
    const cms = buildContentInfoSignedData(
      this.certificate,
      signedAttrs,
      signatureBytes,
      tsaTokenDer,
    );
    return Buffer.from(forge.asn1.toDer(cms).getBytes(), 'binary');
  }
}

// --------------------------------------------------------------------
// CMS / RFC 5652 ASN.1 builders
//
// We build everything by hand via forge.asn1.create() rather than going
// through forge.pkcs7.createSignedData(), because the latter requires a
// local private key (it computes the SignedAttributes digest internally
// and won't expose the digest for external KMS signing). Hand-building
// is verbose but the structure is well-specified by RFC 5652.
// --------------------------------------------------------------------

const OID_DATA = '1.2.840.113549.1.7.1';
const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';
const OID_SIGNING_CERTIFICATE_V2 = '1.2.840.113549.1.9.16.2.47';
const OID_TIMESTAMP_TOKEN = '1.2.840.113549.1.9.16.2.14';

/**
 * SignedAttributes [0] IMPLICIT SET OF Attribute.
 *
 * Order matches the canonical PAdES baseline contract:
 *   - contentType       = id-data
 *   - signingTime       = signer's local clock (UNTRUSTED hint, not
 *                         relied upon by verifiers)
 *   - messageDigest     = SHA-256 of the detached content
 *   - signing-cert-v2   = RFC 5035 ESS attribute (REQUIRED for PAdES)
 *
 * Returns the [0] IMPLICIT SET node ready to be embedded in the
 * SignerInfo. For DER-hashing per RFC 5652 §5.4 the caller re-wraps
 * with an explicit SET tag.
 */
function buildSignedAttributes(
  cert: forge.pki.Certificate,
  messageDigest: Buffer,
  signingTime: Date,
): forge.asn1.Asn1 {
  const contentTypeAttr = makeAttribute(OID_CONTENT_TYPE, [
    forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.OID,
      false,
      forge.asn1.oidToDer(OID_DATA).getBytes(),
    ),
  ]);
  const signingTimeAttr = makeAttribute(OID_SIGNING_TIME, [
    forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.UTCTIME,
      false,
      forge.asn1.dateToUtcTime(signingTime),
    ),
  ]);
  const messageDigestAttr = makeAttribute(OID_MESSAGE_DIGEST, [
    forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.OCTETSTRING,
      false,
      messageDigest.toString('binary'),
    ),
  ]);
  const signingCertV2Attr = buildSigningCertificateV2(cert);

  // [0] IMPLICIT — context-specific tag 0, constructed.
  return forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
    contentTypeAttr,
    signingTimeAttr,
    messageDigestAttr,
    signingCertV2Attr,
  ]);
}

/**
 * Attribute ::= SEQUENCE {
 *   attrType   OBJECT IDENTIFIER,
 *   attrValues SET OF AttributeValue
 * }
 */
function makeAttribute(oid: string, values: forge.asn1.Asn1[]): forge.asn1.Asn1 {
  return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.OID,
      false,
      forge.asn1.oidToDer(oid).getBytes(),
    ),
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, values),
  ]);
}

/**
 * RFC 5035 SigningCertificateV2 attribute. Mirrors the implementation
 * in p12-tsa-signer.ts — the underlying ESS structure is identical
 * regardless of how the signature is computed.
 *
 *   SigningCertificateV2 ::= SEQUENCE {
 *     certs  SEQUENCE OF ESSCertIDv2,
 *     ...
 *   }
 *   ESSCertIDv2 ::= SEQUENCE {
 *     hashAlgorithm  AlgorithmIdentifier  DEFAULT id-sha256,
 *     certHash       OCTET STRING,
 *     issuerSerial   IssuerSerial OPTIONAL
 *   }
 */
function buildSigningCertificateV2(cert: forge.pki.Certificate): forge.asn1.Asn1 {
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certHash = createHash('sha256').update(certDer, 'binary').digest();

  const hashAlgorithm = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.OID,
        false,
        forge.asn1.oidToDer(OID_SHA256).getBytes(),
      ),
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
    ],
  );

  const certHashOctets = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.OCTETSTRING,
    false,
    certHash.toString('binary'),
  );

  const issuerName = forge.pki.distinguishedNameToAsn1(cert.issuer);
  const directoryName = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 4, true, [issuerName]);
  const generalNames = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [directoryName],
  );
  const serialNumberAsn1 = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.INTEGER,
    false,
    hexToBinary(cert.serialNumber),
  );
  const issuerSerial = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [generalNames, serialNumberAsn1],
  );

  const essCertIdV2 = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [hashAlgorithm, certHashOctets, issuerSerial],
  );
  const signingCertificateV2 = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [essCertIdV2])],
  );

  return makeAttribute(OID_SIGNING_CERTIFICATE_V2, [signingCertificateV2]);
}

/**
 * ContentInfo {
 *   contentType: id-signedData,
 *   content [0] EXPLICIT SignedData
 * }
 *
 * SignedData {
 *   version                INTEGER (1),
 *   digestAlgorithms       SET OF AlgorithmIdentifier,
 *   encapContentInfo       EncapsulatedContentInfo,
 *   certificates       [0] IMPLICIT CertificateSet,
 *   signerInfos            SET OF SignerInfo
 * }
 */
function buildContentInfoSignedData(
  cert: forge.pki.Certificate,
  signedAttrs: forge.asn1.Asn1,
  signature: Buffer,
  tsaTokenDer: Buffer | null,
): forge.asn1.Asn1 {
  // digestAlgorithms — SET { sha256 AlgorithmIdentifier }.
  const sha256AlgId = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.OID,
        false,
        forge.asn1.oidToDer(OID_SHA256).getBytes(),
      ),
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
    ],
  );
  const digestAlgorithms = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SET,
    true,
    [sha256AlgId],
  );

  // encapContentInfo — { contentType: id-data, [content omitted, detached] }.
  const encapContentInfo = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.OID,
        false,
        forge.asn1.oidToDer(OID_DATA).getBytes(),
      ),
    ],
  );

  // certificates [0] IMPLICIT — wraps the embedded cert ASN.1.
  const certAsn1 = forge.pki.certificateToAsn1(cert);
  const certificatesField = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [
    certAsn1,
  ]);

  // SignerInfo.
  const signerInfo = buildSignerInfo(cert, signedAttrs, signature, tsaTokenDer);
  const signerInfos = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [
    signerInfo,
  ]);

  // SignedData SEQUENCE.
  const signedData = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.INTEGER,
      false,
      String.fromCharCode(1),
    ),
    digestAlgorithms,
    encapContentInfo,
    certificatesField,
    signerInfos,
  ]);

  // ContentInfo → wraps signedData in [0] EXPLICIT.
  return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.OID,
      false,
      forge.asn1.oidToDer(OID_SIGNED_DATA).getBytes(),
    ),
    forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData]),
  ]);
}

/**
 * SignerInfo ::= SEQUENCE {
 *   version            INTEGER (1),
 *   sid                IssuerAndSerialNumber,
 *   digestAlgorithm    AlgorithmIdentifier (sha256),
 *   signedAttrs    [0] IMPLICIT SignedAttributes,
 *   signatureAlgorithm AlgorithmIdentifier (rsaEncryption),
 *   signature          OCTET STRING,
 *   unsignedAttrs  [1] IMPLICIT UnsignedAttributes OPTIONAL
 * }
 */
function buildSignerInfo(
  cert: forge.pki.Certificate,
  signedAttrs: forge.asn1.Asn1,
  signature: Buffer,
  tsaTokenDer: Buffer | null,
): forge.asn1.Asn1 {
  const issuerName = forge.pki.distinguishedNameToAsn1(cert.issuer);
  const serialNumberAsn1 = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.INTEGER,
    false,
    hexToBinary(cert.serialNumber),
  );
  const issuerAndSerial = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [issuerName, serialNumberAsn1],
  );

  const sha256AlgId = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.OID,
        false,
        forge.asn1.oidToDer(OID_SHA256).getBytes(),
      ),
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
    ],
  );

  const rsaAlgId = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.OID,
      false,
      forge.asn1.oidToDer(OID_RSA_ENCRYPTION).getBytes(),
    ),
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
  ]);

  const signatureOctets = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.OCTETSTRING,
    false,
    signature.toString('binary'),
  );

  const children: forge.asn1.Asn1[] = [
    forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.INTEGER,
      false,
      String.fromCharCode(1),
    ),
    issuerAndSerial,
    sha256AlgId,
    signedAttrs, // [0] IMPLICIT — already tagged.
    rsaAlgId,
    signatureOctets,
  ];

  if (tsaTokenDer && tsaTokenDer.length > 0) {
    const tsaAttribute = buildTimestampAttribute(tsaTokenDer);
    const unsignedAttrs = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 1, true, [
      tsaAttribute,
    ]);
    children.push(unsignedAttrs);
  }

  return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, children);
}

/**
 * id-aa-signatureTimeStampToken Attribute (RFC 3161 §5.3) — wraps the
 * TST DER bytes in the standard CMS Attribute shape.
 */
function buildTimestampAttribute(tokenDer: Buffer): forge.asn1.Asn1 {
  const tokenAsn1 = forge.asn1.fromDer(tokenDer.toString('binary'));
  return makeAttribute(OID_TIMESTAMP_TOKEN, [tokenAsn1]);
}

/**
 * forge stores certificate.serialNumber as a hex string. Convert to
 * the binary OCTET payload an INTEGER expects, prepending 0x00 if
 * the high bit of the first byte is set so DER stays unambiguously
 * non-negative (per X.690 §8.3.3).
 */
function hexToBinary(hex: string): string {
  const trimmed = hex.length % 2 === 0 ? hex : `0${hex}`;
  let out = '';
  for (let i = 0; i < trimmed.length; i += 2) {
    out += String.fromCharCode(parseInt(trimmed.slice(i, i + 2), 16));
  }
  if (out.length > 0 && (out.charCodeAt(0) & 0x80) !== 0) {
    out = String.fromCharCode(0) + out;
  }
  return out;
}

/**
 * Load an X.509 certificate from PEM bytes (string or Buffer).
 * Surfaced as a top-level helper so the module factory can resolve
 * `PDF_SIGNING_KMS_CERT_PEM` / `PDF_SIGNING_KMS_CERT_PEM_PATH` once
 * at boot and pass the parsed cert into the signer constructor.
 */
export function loadCertificateFromPem(pem: string): forge.pki.Certificate {
  return forge.pki.certificateFromPem(pem);
}
