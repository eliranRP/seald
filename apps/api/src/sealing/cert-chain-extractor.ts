import forge from 'node-forge';

/**
 * Per-cert metadata extracted from a CMS SignedData / TST `certificates` SET,
 * sufficient to drive OCSP / CRL fetches for PAdES B-LT DSS embedding.
 *
 * `der` is the raw certificate bytes (so we can write them verbatim into a
 * PDF stream object inside the /DSS /Certs array). The string fields are
 * for logging, debugging, and (in the case of `serialHex` + `issuerDn`)
 * building the OCSP CertID structure.
 *
 * `ocspUrls` and `crlUrls` are extracted from the cert's AIA and CRL
 * Distribution Points extensions respectively — both are commonly absent
 * on root self-signed CAs (which don't need to be checked anyway).
 */
export interface CertWithMetadata {
  readonly der: Buffer;
  readonly subjectDn: string;
  readonly issuerDn: string;
  readonly serialHex: string;
  readonly notBefore: Date;
  readonly notAfter: Date;
  readonly ocspUrls: ReadonlyArray<string>;
  readonly crlUrls: ReadonlyArray<string>;
}

const asn1 = forge.asn1;
const OID_PKCS7_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_AIA = '1.3.6.1.5.5.7.1.1';
const OID_AIA_OCSP = '1.3.6.1.5.5.7.48.1';
const OID_CRL_DISTRIBUTION_POINTS = '2.5.29.31';

/**
 * Extract every certificate from a CMS ContentInfo (id-signedData) ASN.1
 * tree. CMS SignedData layout:
 *
 *   ContentInfo ::= SEQUENCE { contentType OID, content [0] EXPLICIT SignedData }
 *   SignedData ::= SEQUENCE {
 *     version, digestAlgorithms, encapContentInfo,
 *     certificates [0] IMPLICIT CertificateSet OPTIONAL,
 *     ...
 *   }
 *
 * We dig down to the [0] IMPLICIT context-specific tag, then parse each
 * inner Certificate. Returns [] when no cert set is present (not all CMS
 * blobs include certs).
 */
export function parseCertChainFromCms(cmsAsn1: forge.asn1.Asn1): CertWithMetadata[] {
  const ciSeq = cmsAsn1.value as forge.asn1.Asn1[];
  if (!Array.isArray(ciSeq) || ciSeq.length < 2) return [];
  const oid = asn1.derToOid(ciSeq[0]!.value as unknown as string);
  if (oid !== OID_PKCS7_SIGNED_DATA) return [];

  const explicit0 = ciSeq[1]!;
  const signedData = (explicit0.value as forge.asn1.Asn1[])[0];
  if (!signedData) return [];

  const sdValue = signedData.value as forge.asn1.Asn1[];
  // Walk the SignedData children looking for the CertificateSet at [0]
  // IMPLICIT. node-forge surfaces context-specific tags via `tagClass ===
  // CONTEXT_SPECIFIC` (numeric 2) and `type` matching the tag number.
  for (const child of sdValue) {
    if (child.tagClass === asn1.Class.CONTEXT_SPECIFIC && child.type === 0) {
      const certs = child.value as forge.asn1.Asn1[];
      const out: CertWithMetadata[] = [];
      for (const certAsn1 of certs) {
        const meta = certAsn1ToMetadata(certAsn1);
        if (meta) out.push(meta);
      }
      return out;
    }
  }
  return [];
}

/**
 * A TST is itself a CMS ContentInfo (per RFC 3161 §2.4.2 the TimeStampToken
 * is a SignedData), so its cert chain extractor is just an alias around
 * `parseCertChainFromCms`. We expose a named helper anyway so the call
 * site reads correctly at the DSS-injector boundary.
 */
export function parseCertChainFromTst(tstAsn1: forge.asn1.Asn1): CertWithMetadata[] {
  return parseCertChainFromCms(tstAsn1);
}

function certAsn1ToMetadata(certAsn1: forge.asn1.Asn1): CertWithMetadata | null {
  try {
    const cert = forge.pki.certificateFromAsn1(certAsn1);
    const der = Buffer.from(asn1.toDer(certAsn1).getBytes(), 'binary');
    return {
      der,
      subjectDn: dnToString(cert.subject),
      issuerDn: dnToString(cert.issuer),
      serialHex: cert.serialNumber, // already hex per node-forge
      notBefore: cert.validity.notBefore,
      notAfter: cert.validity.notAfter,
      ocspUrls: extractOcspUrls(cert),
      crlUrls: extractCrlUrls(cert),
    };
  } catch {
    return null;
  }
}

function dnToString(dn: forge.pki.Certificate['subject']): string {
  const parts: string[] = [];
  for (const a of dn.attributes) {
    parts.push(`${a.shortName ?? a.name ?? a.type}=${String(a.value)}`);
  }
  return parts.join(', ');
}

/**
 * Extract OCSP responder URLs from the AIA extension (RFC 5280 §4.2.2.1).
 *
 *   AuthorityInfoAccessSyntax  ::=  SEQUENCE OF AccessDescription
 *   AccessDescription          ::=  SEQUENCE {
 *     accessMethod   OBJECT IDENTIFIER,
 *     accessLocation GeneralName
 *   }
 *
 * We only care about accessMethod = id-ad-ocsp (1.3.6.1.5.5.7.48.1) and
 * accessLocation tagged as uniformResourceIdentifier ([6] IMPLICIT IA5String).
 */
function extractOcspUrls(cert: forge.pki.Certificate): string[] {
  const urls: string[] = [];
  // node-forge typings declare `id` as `number`, but the runtime accepts a
  // dotted-OID string in the same field — that's what every CA-issued cert
  // is keyed under. Cast through `unknown` so the call is permitted under
  // strict typings without contaminating callers.
  const ext = cert.getExtension({ id: OID_AIA } as unknown as { id: number }) as
    | { value: string; id: string }
    | undefined;
  if (!ext) return urls;
  try {
    const aia = asn1.fromDer(ext.value);
    const seqs = aia.value as forge.asn1.Asn1[];
    for (const ad of seqs) {
      const adValue = ad.value as forge.asn1.Asn1[];
      if (adValue.length < 2) continue;
      const method = asn1.derToOid(adValue[0]!.value as unknown as string);
      if (method !== OID_AIA_OCSP) continue;
      const loc = adValue[1]!;
      // GeneralName tag 6 = uniformResourceIdentifier (context-specific).
      if (loc.tagClass === asn1.Class.CONTEXT_SPECIFIC && loc.type === 6) {
        const url = String(loc.value);
        if (url) urls.push(url);
      }
    }
  } catch {
    // Malformed AIA — ignore. Production CAs always emit valid AIA but a
    // hostile / corrupt cert shouldn't crash the seal pipeline.
  }
  return urls;
}

/**
 * Extract CRL distribution-point URLs from the CRLDistributionPoints
 * extension (RFC 5280 §4.2.1.13).
 *
 *   CRLDistributionPoints ::= SEQUENCE SIZE (1..MAX) OF DistributionPoint
 *   DistributionPoint ::= SEQUENCE {
 *     distributionPoint [0] DistributionPointName OPTIONAL,
 *     reasons           [1] ReasonFlags           OPTIONAL,
 *     cRLIssuer         [2] GeneralNames          OPTIONAL
 *   }
 *   DistributionPointName ::= CHOICE {
 *     fullName              [0] GeneralNames,
 *     nameRelativeToCRLIssuer [1] RelativeDistinguishedName
 *   }
 */
function extractCrlUrls(cert: forge.pki.Certificate): string[] {
  const urls: string[] = [];
  const ext = cert.getExtension({
    id: OID_CRL_DISTRIBUTION_POINTS,
  } as unknown as { id: number }) as { value: string; id: string } | undefined;
  if (!ext) return urls;
  try {
    const seq = asn1.fromDer(ext.value);
    const dps = seq.value as forge.asn1.Asn1[];
    for (const dp of dps) {
      walkCrlDpForUrls(dp, urls);
    }
  } catch {
    // Same as AIA — ignore parse errors and return what we have.
  }
  return urls;
}

function walkCrlDpForUrls(node: forge.asn1.Asn1, out: string[]): void {
  if (Array.isArray(node.value)) {
    for (const child of node.value as forge.asn1.Asn1[]) {
      // GeneralName tag 6 = URI; the value is an IA5String of bytes we
      // just stringify.
      if (child.tagClass === asn1.Class.CONTEXT_SPECIFIC && child.type === 6) {
        const url = String(child.value);
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
          out.push(url);
        }
      } else {
        walkCrlDpForUrls(child, out);
      }
    }
  }
}
