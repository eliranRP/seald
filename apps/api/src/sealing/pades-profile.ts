import forge from 'node-forge';
import { extractCmsFromPdf, sliceDerSequence } from './pades-verify-helpers';

/** id-aa-signatureTimeStampToken, the unsigned attribute that makes B-T. */
const OID_SIGNATURE_TIMESTAMP = '1.2.840.113549.1.9.16.2.14';

export type PadesLevel = 'none' | 'B-B' | 'B-T' | 'B-LT' | 'B-LTA';

/**
 * What a sealed PDF actually carries, read from its bytes. The public
 * verify page shows its "PAdES" and "Timestamped" claims from this, so a
 * seal that degraded (TSA down, DSS step failed, Noop signer) never shows
 * a level it does not have.
 */
export interface PadesProfile {
  readonly level: PadesLevel;
  /** RFC 3161 timestamp on the signature (B-T and above). */
  readonly timestamped: boolean;
}

const ORDER: readonly PadesLevel[] = ['none', 'B-B', 'B-T', 'B-LT', 'B-LTA'];

/** The weaker of two profiles (multi-document envelopes report the weakest). */
export function weakestProfile(a: PadesProfile, b: PadesProfile): PadesProfile {
  return ORDER.indexOf(a.level) <= ORDER.indexOf(b.level) ? a : b;
}

/**
 * Same checks as `scripts/verify-pades.ts`, reduced to a level:
 * - B-B: a `/ETSI.CAdES.detached` signature whose CMS parses;
 * - B-T: that signature's SignerInfo has a signature timestamp token;
 * - B-LT: B-T plus a `/DSS` dictionary;
 * - B-LTA: B-LT plus a `/DocTimeStamp` (`/ETSI.RFC3161`) written after it.
 * Never throws: anything unreadable is `none`.
 */
export function detectPadesProfile(pdf: Buffer): PadesProfile {
  const none: PadesProfile = { level: 'none', timestamped: false };
  const text = pdf.toString('latin1');
  if (!/\/SubFilter\s*\/ETSI\.CAdES\.detached/.test(text)) return none;

  let timestamped: boolean;
  try {
    // Rule S.5: our own helpers, never @signpdf/utils.extractSignature.
    const { contentsHexDecoded } = extractCmsFromPdf(pdf);
    const der = sliceDerSequence(contentsHexDecoded);
    timestamped = signerInfoHasTimestamp(forge.asn1.fromDer(der.toString('binary')));
  } catch {
    return none;
  }
  if (!timestamped) return { level: 'B-B', timestamped: false };

  const dss = /\/Type\s*\/DSS\b/.exec(text);
  if (dss === null) return { level: 'B-T', timestamped: true };
  const after = text.slice(dss.index);
  const docTs = /\/Type\s*\/DocTimeStamp\b/.exec(after);
  if (docTs === null) return { level: 'B-LT', timestamped: true };
  // The /SubFilter sits in the same signature dictionary as /Type.
  const dict = after.slice(Math.max(0, docTs.index - 512), docTs.index + 512);
  if (!/\/SubFilter\s*\/ETSI\.RFC3161\b/.test(dict)) return { level: 'B-LT', timestamped: true };
  return { level: 'B-LTA', timestamped: true };
}

/** ContentInfo → SignedData → first SignerInfo → unsignedAttrs [1]. */
function signerInfoHasTimestamp(contentInfo: forge.asn1.Asn1): boolean {
  const explicit = (contentInfo.value as forge.asn1.Asn1[])[1];
  const signedData = (explicit?.value as forge.asn1.Asn1[] | undefined)?.[0];
  const parts = signedData?.value as forge.asn1.Asn1[] | undefined;
  const signerInfos = parts?.[parts.length - 1];
  const signerInfo = (signerInfos?.value as forge.asn1.Asn1[] | undefined)?.[0];
  if (signerInfo === undefined) return false;
  return (signerInfo.value as forge.asn1.Asn1[]).some((child) => {
    if (child.tagClass !== forge.asn1.Class.CONTEXT_SPECIFIC || child.type !== 1) return false;
    return (child.value as forge.asn1.Asn1[]).some((attr) => {
      const oidNode = (attr.value as forge.asn1.Asn1[])[0];
      return (
        oidNode !== undefined &&
        forge.asn1.derToOid(oidNode.value as unknown as string) === OID_SIGNATURE_TIMESTAMP
      );
    });
  });
}
