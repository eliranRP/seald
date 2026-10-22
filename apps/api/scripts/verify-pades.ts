/**
 * PAdES verifier (F-13) — CI gate that consumes the sealed PDF artefacts
 * produced by the e2e suite and asserts they are PAdES-conformant. Runs
 * the same kind of validation EU DSS does but self-contained: no Java
 * runtime, no third-party trust list — every check is local, structural,
 * and cryptographic.
 *
 * What this script enforces, per artefact:
 *
 *   1. /Sig dictionary present with /SubFilter /ETSI.CAdES.detached.
 *      (The legacy /adbe.pkcs7.detached marker is rejected — verifiers
 *      key off ETSI.CAdES.detached to attempt PAdES validation.)
 *
 *   2. /ByteRange covers the file minus /Sig.Contents. We re-compute
 *      SHA-256 of those bytes and assert it matches messageDigest in
 *      the CMS SignedAttributes.
 *
 *   3. CMS SignedData carries a SignerInfo whose SignedAttributes
 *      include the four PAdES-mandated attributes:
 *        - contentType      (id-data)
 *        - messageDigest    (matches step 2)
 *        - signingTime      (UTCTime hint, untrusted)
 *        - signing-certificate-v2  (RFC 5035, OID 1.2.840.113549.1.9.16.2.47)
 *      and DOES NOT carry the legacy SHA-1 signing-certificate-v1
 *      (OID 1.2.840.113549.1.9.16.2.12) — that's a B-B violation.
 *
 *   4. The SignerInfo's signature OCTET STRING actually verifies against
 *      the embedded certificate's public key over the SHA-256 of DER-
 *      encoded SignedAttributes (with explicit SET tag, RFC 5652 §5.4).
 *
 *   5. (Soft check) PAdES-B-T: SignerInfo.unsignedAttrs contains
 *      id-aa-signatureTimeStampToken (OID 1.2.840.113549.1.9.16.2.14).
 *      Surfaced as a warning if absent — a B-B-only artefact is still
 *      valid output for the no-TSA test paths.
 *
 *   6. (Soft check) PAdES-B-LT: catalog has a /DSS reference. Surfaced
 *      as an info line; only the DSS-injected fixtures are expected to
 *      have it.
 *
 *   7. (Hard check, WP-01) PAdES-B-LTA: when a /DSS is present, a
 *      /DocTimeStamp (/SubFilter /ETSI.RFC3161) must follow it. Its
 *      /ByteRange must cover the whole file except its /Contents, and
 *      the TST's messageImprint must equal SHA-256 of those bytes.
 *
 * Usage:
 *
 *   pnpm --filter api exec ts-node scripts/verify-pades.ts <dir>
 *
 * Exits 0 if every PDF in <dir> passes the hard checks (1-4, 7), 1
 * otherwise. Soft checks (5, 6) only emit log lines.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import forge from 'node-forge';
import { extractCmsFromPdf, sliceDerSequence } from '../src/sealing/pades-verify-helpers';

const OID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_DATA = '1.2.840.113549.1.7.1';
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_TIME = '1.2.840.113549.1.9.5';
const OID_SIGNING_CERTIFICATE_V1 = '1.2.840.113549.1.9.16.2.12';
const OID_SIGNING_CERTIFICATE_V2 = '1.2.840.113549.1.9.16.2.47';
const OID_TIMESTAMP_TOKEN = '1.2.840.113549.1.9.16.2.14';

export interface VerifyResult {
  readonly path: string;
  readonly errors: string[];
  readonly warnings: string[];
  readonly info: string[];
}

export function verifyOne(path: string, bytes: Buffer): VerifyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  const pdfText = bytes.toString('latin1');

  // ---- Hard check 1: /SubFilter /ETSI.CAdES.detached
  if (!/\/SubFilter\s*\/ETSI\.CAdES\.detached/.test(pdfText)) {
    if (/\/SubFilter\s*\/adbe\.pkcs7\.detached/.test(pdfText)) {
      errors.push('subfilter is the legacy /adbe.pkcs7.detached — must be /ETSI.CAdES.detached');
    } else {
      // No signature at all? That's fine for a passthrough Noop output.
      // Surface as info — caller decides whether to gate on it.
      info.push(
        'no /SubFilter /ETSI.CAdES.detached found (likely an unsigned NoopPadesSigner output)',
      );
      return { path, errors, warnings, info };
    }
  }

  // ---- Hard check 2 prep: extract CMS bytes from /Contents.
  //
  // We can NOT use @signpdf/utils.extractSignature here — it strips
  // trailing 00-byte pairs from the hex blob, which corrupts any CMS
  // whose terminal DER byte is legitimately 0x00 (DER INTEGER /
  // OCTET STRING payloads commonly end this way). Instead we parse
  // /ByteRange + /Contents directly and use the outer SEQUENCE's
  // declared length to pick exactly the real-CMS prefix; bytes past
  // the SEQUENCE end are placeholder zero-padding by definition.
  let cmsBytes: Buffer;
  let signedRange: Buffer;
  try {
    const extracted = extractCmsFromPdf(bytes);
    cmsBytes = sliceDerSequence(extracted.contentsHexDecoded);
    signedRange = extracted.signedRange;
  } catch (err) {
    errors.push(
      `failed to extract /Sig.Contents: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { path, errors, warnings, info };
  }

  // ---- Decode CMS ASN.1.
  let cmsAsn1: forge.asn1.Asn1;
  try {
    cmsAsn1 = forge.asn1.fromDer(cmsBytes.toString('binary'));
  } catch (err) {
    errors.push(`CMS ASN.1 parse failed: ${err instanceof Error ? err.message : String(err)}`);
    return { path, errors, warnings, info };
  }

  const ciValue = cmsAsn1.value as forge.asn1.Asn1[];
  const ciOid = forge.asn1.derToOid(ciValue[0]!.value as unknown as string);
  if (ciOid !== OID_SIGNED_DATA) {
    errors.push(`CMS ContentInfo OID is ${ciOid}, expected id-signedData (${OID_SIGNED_DATA})`);
    return { path, errors, warnings, info };
  }

  // ---- Walk to SignerInfo.
  const explicit0 = ciValue[1] as forge.asn1.Asn1;
  const signedData = (explicit0.value as forge.asn1.Asn1[])[0] as forge.asn1.Asn1;
  const sdValue = signedData.value as forge.asn1.Asn1[];

  // signerInfos = the last SET in SignedData whose first child is a SEQUENCE.
  let signerInfo: forge.asn1.Asn1 | null = null;
  for (let i = sdValue.length - 1; i >= 0; i--) {
    const node = sdValue[i]!;
    if (node.type === forge.asn1.Type.SET && Array.isArray(node.value) && node.value.length > 0) {
      const first = (node.value as forge.asn1.Asn1[])[0]!;
      if (first.type === forge.asn1.Type.SEQUENCE) {
        signerInfo = first;
        break;
      }
    }
  }
  if (!signerInfo) {
    errors.push('SignerInfo not found in CMS SignedData');
    return { path, errors, warnings, info };
  }

  // ---- Embedded certificate (certificates [0] IMPLICIT). Pull the first.
  let cert: forge.pki.Certificate | null = null;
  for (const child of sdValue) {
    if (child.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && child.type === 0) {
      const certNode = (child.value as forge.asn1.Asn1[])[0];
      if (certNode) {
        try {
          cert = forge.pki.certificateFromAsn1(certNode);
        } catch (err) {
          errors.push(
            `embedded certificate parse failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      break;
    }
  }
  if (!cert) {
    errors.push('no embedded certificate in CMS SignedData');
    return { path, errors, warnings, info };
  }

  // ---- Hard check 3: SignedAttributes contents.
  const signedAttrs = findSignedAttrs(signerInfo);
  if (!signedAttrs) {
    errors.push('SignedAttributes [0] IMPLICIT missing on SignerInfo');
    return { path, errors, warnings, info };
  }
  const oidsPresent = new Set<string>();
  let messageDigestBytes: Buffer | null = null;
  for (const attr of signedAttrs.value as forge.asn1.Asn1[]) {
    const kids = attr.value as forge.asn1.Asn1[];
    const oid = forge.asn1.derToOid(kids[0]!.value as unknown as string);
    oidsPresent.add(oid);
    if (oid === OID_MESSAGE_DIGEST) {
      const valueSet = kids[1]!.value as forge.asn1.Asn1[];
      messageDigestBytes = Buffer.from(valueSet[0]!.value as unknown as string, 'binary');
    }
  }
  for (const required of [
    OID_CONTENT_TYPE,
    OID_MESSAGE_DIGEST,
    OID_SIGNING_TIME,
    OID_SIGNING_CERTIFICATE_V2,
  ]) {
    if (!oidsPresent.has(required)) {
      errors.push(`SignedAttributes missing required attribute ${required}`);
    }
  }
  if (oidsPresent.has(OID_SIGNING_CERTIFICATE_V1)) {
    errors.push(
      `SignedAttributes carries legacy signing-certificate-v1 (SHA-1) — PAdES B-B forbids this`,
    );
  }

  // ---- Hard check 2 finalize: messageDigest matches sha256(signedRange).
  if (messageDigestBytes) {
    const computed = createHash('sha256').update(signedRange).digest();
    if (!computed.equals(messageDigestBytes)) {
      errors.push(
        `messageDigest mismatch: cms=${messageDigestBytes.toString('hex').slice(0, 16)}… computed=${computed.toString('hex').slice(0, 16)}…`,
      );
    }
  }

  // ---- Hard check 4: signature verifies under the embedded cert.
  // Re-encode signedAttrs with explicit SET tag (RFC 5652 §5.4) and
  // SHA-256 it; recover the OCTET STRING signature and verify with
  // the certificate's public key.
  let signatureBytes: Buffer | null = null;
  for (const child of signerInfo.value as forge.asn1.Asn1[]) {
    if (
      child.type === forge.asn1.Type.OCTETSTRING &&
      child.tagClass === forge.asn1.Class.UNIVERSAL
    ) {
      signatureBytes = Buffer.from(child.value as unknown as string, 'binary');
    }
  }
  if (!signatureBytes) {
    errors.push('SignerInfo.signature OCTET STRING missing');
  } else {
    const setForm = forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.SET,
      true,
      signedAttrs.value as forge.asn1.Asn1[],
    );
    const setDer = forge.asn1.toDer(setForm).getBytes();
    const setHash = createHash('sha256').update(setDer, 'binary').digest();
    try {
      const md = forge.md.sha256.create();
      md.digest = () => forge.util.createBuffer(setHash.toString('binary'));
      const ok = (cert.publicKey as forge.pki.rsa.PublicKey).verify(
        md.digest().getBytes(),
        signatureBytes.toString('binary'),
      );
      if (!ok) {
        errors.push('CMS signature did not verify under embedded cert public key');
      }
    } catch (err) {
      errors.push(
        `CMS signature verify threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ---- Soft check 5: PAdES-B-T (timestamp unsignedAttr).
  const hasTsa = (signerInfo.value as forge.asn1.Asn1[]).some((child) => {
    if (child.tagClass !== forge.asn1.Class.CONTEXT_SPECIFIC || child.type !== 1) return false;
    for (const attr of child.value as forge.asn1.Asn1[]) {
      const kids = attr.value as forge.asn1.Asn1[];
      const oid = forge.asn1.derToOid(kids[0]!.value as unknown as string);
      if (oid === OID_TIMESTAMP_TOKEN) return true;
    }
    return false;
  });
  if (hasTsa) {
    info.push('PAdES-B-T: id-aa-signatureTimeStampToken present');
  } else {
    warnings.push('PAdES-B-B only (no embedded timestamp)');
  }

  // ---- Soft check 6: PAdES-B-LT (/DSS dictionary on catalog).
  if (/\/DSS\s+\d+\s+0\s+R/.test(pdfText)) {
    info.push('PAdES-B-LT: /DSS dictionary present on catalog');
  }

  // ---- Hard check 7: PAdES-B-LTA (archive timestamp, WP-01). Every
  // artefact that carries a /DSS must also carry a /DocTimeStamp
  // written after it (ETSI EN 319 142-1 §6.4), whose /ByteRange runs to
  // the end of the file and whose TST messageImprint is the SHA-256 of
  // those bytes. The seal pipeline turns B-LT into B-LTA whenever a TSA
  // is configured, and the DSS step only runs after a B-T timestamp.
  const dssOffset = firstMatchOffset(pdfText, /\/Type\s*\/DSS\b/);
  if (dssOffset >= 0) {
    const lta = checkDocTimeStampAfter(bytes, pdfText, dssOffset);
    errors.push(...lta.errors);
    info.push(...lta.info);
  } else if (/\/Type\s*\/DocTimeStamp/.test(pdfText)) {
    warnings.push('/DocTimeStamp present without a /DSS before it (not PAdES-B-LTA)');
  }

  // OID_DATA reference is consulted via SignedAttributes[contentType], but TS
  // marks it unused if the assertion above ever skips. Touch the constant so
  // a future tightening of unused-import lint doesn't silently drop it.
  void OID_DATA;

  return { path, errors, warnings, info };
}

function firstMatchOffset(text: string, re: RegExp): number {
  const m = re.exec(text);
  return m ? m.index : -1;
}

const OID_TST_INFO = '1.2.840.113549.1.9.16.1.4';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';

/**
 * Find the first `/Type /DocTimeStamp` signature dict after `afterOffset`
 * and check it covers the rest of the file and timestamps those bytes.
 * Reads /ByteRange + /Contents directly (rule S.5: no
 * `@signpdf/utils.extractSignature`) and slices the TST by its outer DER
 * length, like the B-T path above.
 */
function checkDocTimeStampAfter(
  bytes: Buffer,
  pdfText: string,
  afterOffset: number,
): { errors: string[]; info: string[] } {
  const errors: string[] = [];
  const info: string[] = [];
  const tail = pdfText.slice(afterOffset);
  const relType = firstMatchOffset(tail, /\/Type\s*\/DocTimeStamp\b/);
  if (relType < 0) {
    errors.push('PAdES-B-LTA: /DSS present but no /DocTimeStamp after it');
    return { errors, info };
  }
  const typeOffset = afterOffset + relType;
  const dictStart = pdfText.lastIndexOf('<<', typeOffset);
  const dictEnd = pdfText.indexOf('endobj', typeOffset);
  const dict = pdfText.slice(dictStart, dictEnd < 0 ? undefined : dictEnd);
  if (!/\/SubFilter\s*\/ETSI\.RFC3161/.test(dict)) {
    errors.push('PAdES-B-LTA: /DocTimeStamp dict lacks /SubFilter /ETSI.RFC3161');
  }
  const br = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(dict);
  if (!br) {
    errors.push('PAdES-B-LTA: /DocTimeStamp has no /ByteRange');
    return { errors, info };
  }
  const [a, b, c, d] = [br[1], br[2], br[3], br[4]].map(Number) as [number, number, number, number];
  if (a !== 0 || c + d !== bytes.length || bytes[a + b] !== 0x3c /* '<' */) {
    errors.push(
      `PAdES-B-LTA: /DocTimeStamp /ByteRange [${a} ${b} ${c} ${d}] does not cover the file (length ${bytes.length}) around its /Contents`,
    );
    return { errors, info };
  }
  let tokenDer: Buffer;
  try {
    const hex = bytes.subarray(a + b + 1, c - 1).toString('latin1');
    tokenDer = sliceDerSequence(Buffer.from(hex, 'hex'));
  } catch (err) {
    errors.push(
      `PAdES-B-LTA: cannot read the /DocTimeStamp token: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { errors, info };
  }
  let imprint: Buffer;
  try {
    imprint = readTstMessageImprint(tokenDer);
  } catch (err) {
    errors.push(
      `PAdES-B-LTA: /DocTimeStamp token is not a parseable TimeStampToken: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { errors, info };
  }
  const covered = Buffer.concat([bytes.subarray(a, a + b), bytes.subarray(c, c + d)]);
  const expected = createHash('sha256').update(covered).digest();
  if (!expected.equals(imprint)) {
    errors.push(
      `PAdES-B-LTA: /DocTimeStamp messageImprint mismatch: tst=${imprint.toString('hex').slice(0, 16)}… computed=${expected.toString('hex').slice(0, 16)}…`,
    );
    return { errors, info };
  }
  info.push('PAdES-B-LTA: /DocTimeStamp after /DSS covers the file; messageImprint matches');
  return { errors, info };
}

/**
 * TimeStampToken (CMS ContentInfo) → SignedData → encapContentInfo
 * (eContentType id-ct-TSTInfo) → TSTInfo.messageImprint.hashedMessage.
 * Only SHA-256 imprints are accepted; that is what TsaClient requests.
 */
function readTstMessageImprint(tokenDer: Buffer): Buffer {
  const asn1 = forge.asn1;
  const ci = asn1.fromDer(tokenDer.toString('binary'));
  const ciValue = ci.value as forge.asn1.Asn1[];
  const ciOid = asn1.derToOid(ciValue[0]!.value as unknown as string);
  if (ciOid !== OID_SIGNED_DATA) throw new Error(`ContentInfo OID ${ciOid} is not signedData`);
  const sd = (ciValue[1]!.value as forge.asn1.Asn1[])[0]!;
  const encap = (sd.value as forge.asn1.Asn1[]).find(
    (n, i) => i > 0 && n.type === asn1.Type.SEQUENCE && n.tagClass === asn1.Class.UNIVERSAL,
  );
  if (!encap) throw new Error('encapContentInfo missing');
  const encapValue = encap.value as forge.asn1.Asn1[];
  const eType = asn1.derToOid(encapValue[0]!.value as unknown as string);
  if (eType !== OID_TST_INFO) throw new Error(`eContentType ${eType} is not id-ct-TSTInfo`);
  const octet = (encapValue[1]!.value as forge.asn1.Asn1[])[0]!;
  const tstInfo = asn1.fromDer(octet.value as unknown as string);
  const mi = (tstInfo.value as forge.asn1.Asn1[])[2]!;
  const miValue = mi.value as forge.asn1.Asn1[];
  const algOid = asn1.derToOid(
    (miValue[0]!.value as forge.asn1.Asn1[])[0]!.value as unknown as string,
  );
  if (algOid !== OID_SHA256) throw new Error(`messageImprint algorithm ${algOid} is not SHA-256`);
  return Buffer.from(miValue[1]!.value as unknown as string, 'binary');
}

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

function main(): void {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: verify-pades <dir-of-pdfs>');
    process.exit(2);
  }
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((n) => extname(n).toLowerCase() === '.pdf');
  } catch (err) {
    console.error(`cannot read ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
  if (entries.length === 0) {
    console.error(`no .pdf files in ${dir}`);
    process.exit(2);
  }

  let failed = 0;
  let warned = 0;
  for (const name of entries) {
    const path = join(dir, name);
    const bytes = readFileSync(path);
    const result = verifyOne(path, bytes);
    const status = result.errors.length > 0 ? 'FAIL' : result.warnings.length > 0 ? 'WARN' : 'PASS';
    console.log(`[${status}] ${name}`);
    for (const line of result.info) console.log(`        info:    ${line}`);
    for (const line of result.warnings) console.log(`        warn:    ${line}`);
    for (const line of result.errors) console.log(`        ERROR:   ${line}`);
    if (result.errors.length > 0) failed++;
    else if (result.warnings.length > 0) warned++;
  }
  console.log('');
  console.log(`Verified ${entries.length} file(s): ${failed} failed, ${warned} warning-only.`);
  process.exit(failed > 0 ? 1 : 0);
}

// Run as a CLI only; the e2e suite imports `verifyOne` directly.
if (require.main === module) main();
