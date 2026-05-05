import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import forge from 'node-forge';
import { appendArchiveTimestamp } from './archive-timestamp';
import {
  parseCertChainFromCms,
  parseCertChainFromTst,
  type CertWithMetadata,
} from './cert-chain-extractor';
import { appendDssIncrementalUpdate } from './dss-incremental-update';
import { extractCmsFromPdf, sliceDerSequence } from './pades-verify-helpers';
import { RevocationFetcher } from './revocation-fetcher';
import { TsaClient } from './tsa-client';

/**
 * Upgrades a PAdES B-T signed PDF to PAdES B-LT (Long-Term Validation) by
 * embedding a `/DSS` (Document Security Store) dictionary at the document
 * catalog. The DSS holds every certificate in the signer + TSA chains
 * plus any OCSP responses / CRLs needed to validate them long after the
 * responders go offline. ETSI EN 319 142-1 §6.3 is the authoritative
 * spec; ISO 32000-2 §12.8.4.3 describes the dictionary structure.
 *
 * High-level pipeline per .upgradeToBLt():
 *   1. Locate the existing PAdES signature inside `/Sig.Contents`. We use
 *      our own `extractCmsFromPdf` + `sliceDerSequence` helpers (rule S.5:
 *      NEVER use @signpdf/utils.extractSignature — it corrupts CMS).
 *   2. Parse the CMS as ASN.1 and extract every Certificate from the
 *      SignedData.certificates SET. Also dig out the embedded TST
 *      (id-aa-timeStampToken unsigned attribute) and parse ITS cert
 *      chain — both chains land in /DSS.
 *   3. For every cert in every chain, ask `RevocationFetcher` for OCSP
 *      and/or CRL. Failures degrade gracefully: missing material is just
 *      omitted from /DSS rather than aborting the seal.
 *   4. Append the /DSS dictionary on the document catalog and return the
 *      resulting PDF bytes.
 *
 * If anything fails (unparseable signature, broken CMS, etc.) we log and
 * return the input bytes unmodified — the seal stays at B-T level.
 *
 * Embedding strategy: a true ISO 32000-1 §7.5.6 incremental update
 * writer (`./dss-incremental-update.ts`). The original PDF bytes are
 * NEVER touched — we APPEND new objects + xref + trailer + %%EOF. The
 * existing PAdES B-T signature's `/ByteRange` and `/Sig.Contents`
 * remain byte-identical, so verifiers still pass the pre-existing
 * signature AND pick up the new /DSS at the document level. ETSI EN
 * 319 142-1 §6.3 + ISO 32000-1 §7.5.6 are the authoritative refs.
 */
@Injectable()
export class DssInjector {
  private readonly logger = new Logger(DssInjector.name);

  constructor(
    private readonly revocations: RevocationFetcher,
    private readonly tsa: TsaClient,
  ) {}

  /**
   * Toggle for emergency rollback only. The incremental-update writer
   * has shipped (`./dss-incremental-update.ts`); under it, embedding is
   * append-only and CANNOT invalidate the pre-existing PAdES B-T
   * signature. There is no production reason to set this to false.
   * Kept as a hatch in case a future verifier we don't know about
   * regresses on the incremental update; can be flipped via env var.
   */
  static EMBED_DSS = true;

  /**
   * PAdES-B-LTA archive timestamp toggle. When enabled, after embedding
   * /DSS we append a Document Timestamp (`/SubFilter /ETSI.RFC3161`) over
   * the post-/DSS state, cryptographically pinning the validation
   * material at a TSA-attested time (ETSI EN 319 142-1 §6.4).
   *
   * Default false until production CI exercises a real TSA round-trip
   * against a sealed B-LT artefact. The append-only contract is the
   * same as the DSS update — original bytes are never touched, so
   * flipping this on cannot invalidate the prior B-T signature.
   */
  static EMBED_LTA = false;

  async upgradeToBLt(signedPdf: Buffer): Promise<Buffer> {
    let cmsAsn1: forge.asn1.Asn1;
    try {
      // Rule S.5: NEVER use @signpdf/utils.extractSignature — it strips
      // trailing 0x00 bytes and corrupts CMS. Use our own helpers instead.
      const { contentsHexDecoded } = extractCmsFromPdf(signedPdf);
      const cmsBuffer = sliceDerSequence(contentsHexDecoded);
      cmsAsn1 = forge.asn1.fromDer(cmsBuffer.toString('binary'));
    } catch (err) {
      this.logger.warn(
        `DSS upgrade skipped — unable to extract CMS from signed PDF: ${(err as Error).message}`,
      );
      return signedPdf;
    }

    let certs: CertWithMetadata[];
    try {
      certs = parseCertChainFromCms(cmsAsn1);
    } catch (err) {
      this.logger.warn(`DSS upgrade skipped — cert chain parse failed: ${(err as Error).message}`);
      return signedPdf;
    }

    // Pull the embedded TST (PAdES-B-T) and recurse into its cert chain.
    const tstCerts: CertWithMetadata[] = [];
    try {
      const tst = extractEmbeddedTimestampToken(cmsAsn1);
      if (tst) tstCerts.push(...parseCertChainFromTst(tst));
    } catch {
      // No TST or unparseable — fine, we'll DSS the signer chain only.
    }

    const allCerts = dedupeCerts([...certs, ...tstCerts]);
    if (allCerts.length === 0) {
      this.logger.warn('DSS upgrade skipped — no certificates extracted from signature');
      return signedPdf;
    }

    // Build subject -> cert lookup so we can resolve issuer for OCSP.
    const bySubject = new Map<string, CertWithMetadata>();
    for (const c of allCerts) bySubject.set(c.subjectDn, c);

    const ocspResponses: Buffer[] = [];
    const crls: Buffer[] = [];
    for (const cert of allCerts) {
      // Self-signed root: skip (no upstream to check).
      if (cert.issuerDn === cert.subjectDn) continue;
      const issuer = bySubject.get(cert.issuerDn);
      if (issuer && cert.ocspUrls.length > 0) {
        const ocsp = await this.revocations.fetchOcsp(cert, issuer);
        if (ocsp) ocspResponses.push(ocsp);
      }
      if (cert.crlUrls.length > 0) {
        const crl = await this.revocations.fetchCrl(cert);
        if (crl) crls.push(crl);
      }
    }

    this.logger.log(
      `DSS upgrade: collected ${allCerts.length} cert(s), ${ocspResponses.length} OCSP, ${crls.length} CRL`,
    );

    if (!DssInjector.EMBED_DSS) {
      // Production safety: see EMBED_DSS comment. The chain extractor +
      // fetcher above ran (so the seal worker still warms caches and
      // surfaces revocation logs), but we DON'T mutate the PDF — the
      // existing PAdES B-T signature would be invalidated by a full
      // re-save. Returning the input verbatim preserves the existing
      // /ByteRange + /Sig.Contents byte ranges.
      return signedPdf;
    }

    let bltPdf: Buffer;
    try {
      bltPdf = embedDssDictionary(signedPdf, allCerts, ocspResponses, crls);
    } catch (err) {
      this.logger.error(
        `DSS embedding failed (${(err as Error).message}); returning B-T PDF unchanged`,
      );
      return signedPdf;
    }

    // PAdES-B-LTA upgrade: append a Document Timestamp over the post-
    // DSS bytes. Best-effort — same contract as the B-T timestamp:
    // failures degrade gracefully to B-LT (no archive timestamp) but
    // never throw. The append-only invariant means the prior B-T
    // signature stays valid regardless.
    if (DssInjector.EMBED_LTA && this.tsa.configured) {
      try {
        return await appendArchiveTimestamp({ pdfWithDss: bltPdf, tsa: this.tsa });
      } catch (err) {
        this.logger.warn(
          `B-LTA archive timestamp failed (${(err as Error).message}); returning B-LT PDF`,
        );
      }
    }

    return bltPdf;
  }
}

/**
 * Walk the CMS SignedData -> SignerInfo[0] -> unsignedAttrs ([1] IMPLICIT)
 * looking for OID 1.2.840.113549.1.9.16.2.14 (id-aa-timeStampToken). The
 * value is a CMS ContentInfo (the TST itself).
 */
function extractEmbeddedTimestampToken(cmsAsn1: forge.asn1.Asn1): forge.asn1.Asn1 | null {
  const asn1 = forge.asn1;
  const OID_ID_AA_TIME_STAMP_TOKEN = '1.2.840.113549.1.9.16.2.14';
  try {
    const ciSeq = cmsAsn1.value as forge.asn1.Asn1[];
    const explicit0 = ciSeq[1]!;
    const signedData = (explicit0.value as forge.asn1.Asn1[])[0]!;
    const sdValue = signedData.value as forge.asn1.Asn1[];
    // SignerInfos is the SET at the END of SignedData.
    const signerInfos = sdValue[sdValue.length - 1]!;
    const signerInfo = (signerInfos.value as forge.asn1.Asn1[])[0]!;
    const siValue = signerInfo.value as forge.asn1.Asn1[];
    // unsignedAttrs is [1] IMPLICIT at the tail.
    for (const child of siValue) {
      if (child.tagClass === asn1.Class.CONTEXT_SPECIFIC && child.type === 1) {
        const attrs = child.value as forge.asn1.Asn1[];
        for (const attr of attrs) {
          const attrSeq = attr.value as forge.asn1.Asn1[];
          if (attrSeq.length < 2) continue;
          const oid = asn1.derToOid(attrSeq[0]!.value as unknown as string);
          if (oid !== OID_ID_AA_TIME_STAMP_TOKEN) continue;
          // The value is a SET containing the TST ContentInfo.
          const set = attrSeq[1]!;
          const tst = (set.value as forge.asn1.Asn1[])[0]!;
          return tst;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

function dedupeCerts(list: CertWithMetadata[]): CertWithMetadata[] {
  const seen = new Set<string>();
  const out: CertWithMetadata[] = [];
  for (const c of list) {
    const key = c.der.toString('base64');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Append a /DSS dictionary onto the PDF as an ISO 32000-1 §7.5.6
 * incremental update. Original PDF bytes are never touched — the new
 * objects (cert / OCSP / CRL streams, DSS dict, updated catalog) +
 * xref + trailer get appended after the existing %%EOF. The pre-
 * existing PAdES B-T signature's /ByteRange + /Sig.Contents stay
 * byte-identical, so signature verification still passes.
 *
 * See `./dss-incremental-update.ts` for the byte-level writer.
 *
 * Each cert / CRL / OCSP becomes its own indirect stream object. The
 * /DSS dict references them via /Certs, /OCSPs, /CRLs arrays. Empty
 * arrays are omitted per ETSI 319 142-1 §6.3.
 */
function embedDssDictionary(
  signedPdf: Buffer,
  certs: ReadonlyArray<CertWithMetadata>,
  ocsps: ReadonlyArray<Buffer>,
  crls: ReadonlyArray<Buffer>,
): Buffer {
  return appendDssIncrementalUpdate({
    originalPdf: signedPdf,
    certs: certs.map((c) => c.der),
    ocsps: [...ocsps],
    crls: [...crls],
  });
}

/**
 * Compute the /VRI key for a signature's /Sig.Contents value. ETSI EN
 * 319 142-1 §6.3 specifies the key as the hex-encoded SHA-1 hash of
 * the signature value (the binary content of /Contents). We don't yet
 * emit VRI sub-dicts in the writer (§6.3 says they're optional when
 * /DSS already covers all chains for all signatures in the document)
 * but expose the hash here so verifiers and future revisions can
 * scope material per-signature.
 *
 * Why SHA-1 even though we never use SHA-1 anywhere else: the spec
 * says SHA-1 here. It's a key-only use (no security claim against
 * collision resistance — just an identifier).
 */
export function computeVriKey(signatureContents: Buffer): string {
  // SHA-1 is required by PAdES/DSS spec (ETSI EN 319 142-1 §6.3) for VRI key
  // computation. This is NOT a security use — it's a lookup identifier only.
  // eslint-disable-next-line no-restricted-syntax -- SHA-1 mandated by spec for VRI keys
  return createHash('sha1').update(signatureContents).digest('hex').toUpperCase();
}
