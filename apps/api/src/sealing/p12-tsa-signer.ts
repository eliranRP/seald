import { createHash } from 'node:crypto';
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
    // Build the ESS signing-certificate-v2 attribute (RFC 5035) BEFORE
    // calling addSigner — node-forge does NOT auto-emit it, so a CMS
    // produced without this code path is non-PAdES-B-B-conformant and
    // vulnerable to SHA-1 collision substitution. esignature-standards-
    // expert §3.1, §13.2.
    const signingCertificateV2 = buildSigningCertificateV2Attribute(certificate);

    p7.addSigner({
      key: privateKey,
      certificate,
      digestAlgorithm: forge.pki.oids.sha256 as string,
      authenticatedAttributes: [
        {
          type: forge.pki.oids.contentType as string,
          value: forge.pki.oids.data as string,
        },
        /*
         * signing-time (PKCS#9, OID 1.2.840.113549.1.9.5) is the SIGNER'S
         * LOCAL CLOCK and is therefore UNTRUSTED per PAdES rules — a
         * malicious or misconfigured signer can put any value here and the
         * CMS signature will still verify. We include it solely for
         * compatibility with legacy CMS verifiers that read it as a hint.
         *
         * The TRUSTED time anchor for this signature is the RFC 3161 TSA
         * token attached below as `id-aa-signatureTimeStampToken`
         * (OID 1.2.840.113549.1.9.16.2.14) on the SignerInfo's unsignedAttrs
         * — see `this.tsa.timestamp(...)` in step 3 and the unsignedAttrs
         * injection in step 4. Removing the TSA call (or letting the TSA
         * round-trip fail and silently fall through) downgrades the
         * signature from PAdES B-T to PAdES B-B; the signing-time below
         * does NOT compensate.
         *
         * cryptography-expert §11; esignature-standards-expert §3.3.
         */
        {
          type: forge.pki.oids.signingTime as string,
          value: (signingTime ?? new Date()) as unknown as string,
        },
        { type: forge.pki.oids.messageDigest as string },
        // signing-certificate-v2 ESS attribute (RFC 5035, OID
        // 1.2.840.113549.1.9.16.2.47). Required by PAdES baseline
        // (esignature-standards-expert §3.1).
        signingCertificateV2,
      ] as Parameters<typeof p7.addSigner>[0]['authenticatedAttributes'],
    });
    p7.sign({ detached: true });

    // Defense-in-depth: assert the produced CMS carries the modern ESS
    // attribute (signing-certificate-v2) and NOT the deprecated SHA-1
    // signing-certificate-v1. PAdES baseline mandates v2 (cryptography-
    // expert §11.4, esignature-standards-expert §3.2). We do this BEFORE
    // injecting the unsignedAttrs so any forge upgrade that flips the
    // default trips this guard immediately rather than producing a
    // silently non-conformant signature.
    assertSigningCertificateV2(p7.toAsn1());

    // ---- 3. Extract encryptedDigest + get TST from TSA ----
    // node-forge's typings don't expose the `signers` property even though
    // it exists at runtime. Bridge through `unknown` (per react-best-
    // practices skill rule 3.2 — prefer unknown + narrowing over `any`).
    // The runtime guard below catches a future node-forge release that
    // renames or restructures this internal field — we'd rather throw a
    // descriptive error at sealing time than silently produce a corrupt
    // signature. node-forge is pinned to an exact version in package.json
    // (no caret) precisely because this is an internal-shape dependency.
    const p7Internals = p7 as unknown as {
      signers?: ReadonlyArray<{ signature: string }>;
    };
    if (!Array.isArray(p7Internals.signers) || p7Internals.signers.length === 0) {
      throw new Error('forge_pkcs7_shape_changed: signers array missing on signed CMS');
    }
    const encryptedDigest = Buffer.from(p7Internals.signers[0]!.signature, 'binary');
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
/** ESS signing-certificate-v2 (RFC 5035) — REQUIRED for PAdES baseline. */
const OID_SIGNING_CERTIFICATE_V2 = '1.2.840.113549.1.9.16.2.47';
/** ESS signing-certificate v1 (RFC 2634, SHA-1 only) — FORBIDDEN for PAdES. */
const OID_SIGNING_CERTIFICATE_V1 = '1.2.840.113549.1.9.16.2.12';

/**
 * Walk the SignedData → SignerInfo → signedAttrs (`[0] IMPLICIT`) and assert
 * that the modern ESS attribute is present and the SHA-1 legacy attribute is
 * absent. Throws `pades_b_b_violation: …` with a precise reason on failure.
 *
 * This is a defense-in-depth check: node-forge currently emits the v2 form by
 * default for SHA-256 signatures, but a future major bump or a config tweak
 * could regress that. Catching the regression at sealing time is far cheaper
 * than discovering it during a verifier audit.
 */
export function assertSigningCertificateV2(pkcs7Asn1: forge.asn1.Asn1): void {
  const signerInfo = findFirstSignerInfo(pkcs7Asn1);
  if (!signerInfo) {
    throw new Error('pades_b_b_violation: signer_info_not_found_for_ess_check');
  }
  const signedAttrs = findSignedAttrs(signerInfo);
  if (!signedAttrs) {
    throw new Error('pades_b_b_violation: signed_attrs_missing');
  }
  let hasV2 = false;
  for (const attr of signedAttrs.value as forge.asn1.Asn1[]) {
    // Each Attribute is a SEQUENCE whose first child is the attrType OID.
    if (attr.type !== forge.asn1.Type.SEQUENCE) continue;
    const children = attr.value as forge.asn1.Asn1[];
    const oidNode = children[0];
    if (!oidNode || oidNode.type !== forge.asn1.Type.OID) continue;
    const oid = forge.asn1.derToOid(oidNode.value as unknown as string);
    if (oid === OID_SIGNING_CERTIFICATE_V1) {
      throw new Error('pades_b_b_violation: legacy_signing_certificate_v1_present');
    }
    if (oid === OID_SIGNING_CERTIFICATE_V2) {
      hasV2 = true;
    }
  }
  if (!hasV2) {
    throw new Error('pades_b_b_violation: signing_certificate_v2_missing');
  }
}

/**
 * SignerInfo ::= SEQUENCE {
 *   version           CMSVersion,
 *   sid               SignerIdentifier,
 *   digestAlgorithm   DigestAlgorithmIdentifier,
 *   signedAttrs   [0] IMPLICIT SignedAttributes OPTIONAL,
 *   signatureAlgorithm SignatureAlgorithmIdentifier,
 *   signature         OCTET STRING,
 *   unsignedAttrs [1] IMPLICIT UnsignedAttributes OPTIONAL
 * }
 *
 * Locate the `[0] IMPLICIT` context-specific node holding signedAttrs.
 */
function findSignedAttrs(signerInfo: forge.asn1.Asn1): forge.asn1.Asn1 | null {
  for (const child of signerInfo.value as forge.asn1.Asn1[]) {
    if (
      child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC &&
      child.type === 0 &&
      Array.isArray(child.value)
    ) {
      return child;
    }
  }
  return null;
}

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

const OID_SHA256 = '2.16.840.1.101.3.4.2.1';

/**
 * Build the ESS signing-certificate-v2 attribute (RFC 5035, OID
 * 1.2.840.113549.1.9.16.2.47) for inclusion in the SignedAttributes of
 * a CMS SignerInfo. PAdES baseline mandates this — without it, a
 * SHA-1 collision substitution attack on the certificates is possible.
 *
 * Structure (RFC 5035):
 *
 *   SigningCertificateV2 ::= SEQUENCE {
 *     certs      SEQUENCE OF ESSCertIDv2,
 *     policies   SEQUENCE OF PolicyInformation OPTIONAL
 *   }
 *   ESSCertIDv2 ::= SEQUENCE {
 *     hashAlgorithm  AlgorithmIdentifier  DEFAULT id-sha256,
 *     certHash       OCTET STRING,
 *     issuerSerial   IssuerSerial OPTIONAL
 *   }
 *   IssuerSerial ::= SEQUENCE {
 *     issuer       GeneralNames,
 *     serialNumber CertificateSerialNumber
 *   }
 *
 * The DEFAULT for hashAlgorithm is id-sha256, but we emit it explicitly
 * so verifiers that don't apply DEFAULT-decoding still see SHA-256.
 *
 * Returns a CMS Attribute structure (the form node-forge expects in
 * authenticatedAttributes when `value` is a pre-built Asn1).
 *
 * cryptography-expert §14; esignature-standards-expert §3.1, §13.2.
 */
interface CustomAttribute {
  readonly type: string;
  readonly value: forge.asn1.Asn1;
}

function buildSigningCertificateV2Attribute(cert: forge.pki.Certificate): CustomAttribute {
  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certHash = createHash('sha256').update(certDer, 'binary').digest();

  // ESSCertIDv2.hashAlgorithm — explicit AlgorithmIdentifier { sha256, NULL }
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

  // ESSCertIDv2.certHash — OCTET STRING of SHA-256(cert DER)
  const certHashOctets = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.OCTETSTRING,
    false,
    certHash.toString('binary'),
  );

  // ESSCertIDv2.issuerSerial.issuer — GeneralNames is a SEQUENCE OF
  // GeneralName. We use directoryName ([4] IMPLICIT) wrapping the
  // issuer Name (RDNSequence) from the cert.
  const issuerName = forge.pki.distinguishedNameToAsn1(cert.issuer);
  const directoryName = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 4, true, [issuerName]);
  const generalNames = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [directoryName],
  );

  // ESSCertIDv2.issuerSerial.serialNumber — INTEGER. forge stores the
  // serial as a hex string; convert to a big-endian byte buffer.
  const serialBytes = hexToBinary(cert.serialNumber);
  const serialNumberAsn1 = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.INTEGER,
    false,
    serialBytes,
  );

  // ESSCertIDv2.issuerSerial — SEQUENCE { issuer, serialNumber }
  const issuerSerial = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [generalNames, serialNumberAsn1],
  );

  // ESSCertIDv2 — SEQUENCE { hashAlgorithm, certHash, issuerSerial }
  const essCertIdV2 = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [hashAlgorithm, certHashOctets, issuerSerial],
  );

  // SigningCertificateV2 — SEQUENCE { certs (SEQUENCE OF ESSCertIDv2) }
  const signingCertificateV2 = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SEQUENCE,
    true,
    [forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [essCertIdV2])],
  );

  // node-forge's authenticatedAttributes accepts entries with a pre-built
  // Asn1 `value` for custom attributes; the encoder wraps each value in
  // SET OF AttributeValue automatically.
  return {
    type: OID_SIGNING_CERTIFICATE_V2,
    value: signingCertificateV2,
  };
}

/**
 * Convert a hex string (forge's `cert.serialNumber` representation) to
 * a binary string suitable for an ASN.1 INTEGER OCTET payload. Pads
 * with a leading 0x00 byte if the high bit of the first byte is set,
 * to keep the INTEGER unambiguously non-negative per DER rules.
 */
function hexToBinary(hex: string): string {
  const trimmed = hex.length % 2 === 0 ? hex : `0${hex}`;
  let out = '';
  for (let i = 0; i < trimmed.length; i += 2) {
    out += String.fromCharCode(parseInt(trimmed.slice(i, i + 2), 16));
  }
  // DER non-negative INTEGER: prepend 0x00 if MSB is set on first byte.
  if (out.length > 0 && (out.charCodeAt(0) & 0x80) !== 0) {
    out = String.fromCharCode(0) + out;
  }
  return out;
}
