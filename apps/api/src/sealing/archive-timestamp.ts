/**
 * PAdES-B-LTA archive timestamp (ETSI EN 319 142-1 §6.4).
 *
 * Given a PAdES B-LT PDF (catalog already carries `/DSS`), append a new
 * `/Sig` field whose `/SubFilter` is `/ETSI.RFC3161` and whose
 * `/Contents` is an RFC 3161 TimeStampToken over the SHA-256 of the
 * byte-ranged bytes. This is the "Document Timestamp" mechanism PAdES
 * uses to cryptographically pin the entire validation material (DSS
 * + prior B-T signature) at a trusted point in time.
 *
 * Why we need it
 * --------------
 * A B-LT signature's chain validity depends on the embedded OCSP / CRL
 * material in /DSS being authentic. Without an archive timestamp anyone
 * with file-system access can swap /DSS contents post-seal and re-issue
 * a "valid" signature with different revocation evidence. The B-LTA
 * doc-timestamp seals the entire post-/DSS state, so any later mutation
 * of /DSS (or the prior signature, or anything else) invalidates the
 * archive timestamp.
 *
 * Append-only invariant
 * ---------------------
 * Identical to dss-incremental-update.ts: the input PDF bytes are NEVER
 * touched. We APPEND a new revision (sig-dict + widget annotation +
 * /AcroForm + new catalog) + xref + trailer + %%EOF. The input's
 * /ByteRange + /Contents stay byte-identical, so the prior signature
 * still verifies.
 *
 * Byte-level layout
 * -----------------
 * The new revision has a fixed shape so we can patch /ByteRange and
 * /Contents IN-PLACE after we know the exact byte offsets:
 *
 *   <sig-dict>      << /Type /DocTimeStamp /SubFilter /ETSI.RFC3161
 *                      /ByteRange [0 X 0 0 ]   ← gets patched
 *                      /Contents <00...00>     ← gets patched
 *                   >>
 *   <sig-widget>    annotation referencing the sig-dict
 *   <acro-form>     /Fields [<sig-widget>]  /SigFlags 3
 *   <new-catalog>   prior catalog + /AcroForm <acro-form>
 *   xref ; trailer ; startxref ; %%EOF
 *
 * The /ByteRange placeholder uses 10-digit zero-padded integers so the
 * numerical value can be replaced without shifting any byte offsets.
 * Same trick @signpdf uses for the original B-T signature.
 */

import { Buffer } from 'node:buffer';
import { Logger } from '@nestjs/common';
import type { TsaClient } from './tsa-client';

const NEWLINE = '\n';
const EOL = Buffer.from(NEWLINE, 'binary');

/** 16 KB binary = 32 KB hex — comfortably accommodates a TSA chain TST. */
const TST_RESERVED_BYTES = 16384;
const TST_RESERVED_HEX = TST_RESERVED_BYTES * 2;

export interface ArchiveTimestampInput {
  readonly pdfWithDss: Buffer;
  readonly tsa: TsaClient;
}

/**
 * Append a Document Timestamp (PAdES-B-LTA) onto a B-LT PDF. Returns
 * the input verbatim if the TSA is not configured or the round-trip
 * fails — same best-effort contract as the B-T timestamp path. The
 * caller surfaces the result through SealingService.
 */
export async function appendArchiveTimestamp(input: ArchiveTimestampInput): Promise<Buffer> {
  const logger = new Logger('archive-timestamp');
  const { pdfWithDss, tsa } = input;

  if (!tsa.configured) {
    logger.warn('TSA not configured — skipping B-LTA archive timestamp');
    return pdfWithDss;
  }

  // ---- 1. Parse the latest trailer of the input.
  // Decode once: on the Edge runtime every whole-file latin1 decode costs
  // tens of milliseconds of the 2 s CPU budget.
  const pdfText = pdfWithDss.toString('latin1');
  const trailer = parseLastTrailer(pdfText);
  const startxref = findStartxref(pdfWithDss);
  const priorCatalogBody = readObjectBody(pdfText, trailer.rootRef);

  // ---- 2. Allocate object numbers for the new revision.
  let nextObjNum = trailer.size;
  const sigDictObjNum = nextObjNum++;
  const sigWidgetObjNum = nextObjNum++;
  const acroFormObjNum = nextObjNum++;
  // Catalog keeps its original number — it's a fresh REVISION, not a new object.

  // ---- 3. Build placeholder bodies. Critical: every byte position in
  // these strings must be stable when we patch /ByteRange + /Contents
  // values in-place. We use fixed-width numeric formatting.
  const byteRangePlaceholder = '[0000000000 0000000000 0000000000 0000000000]';
  const contentsPlaceholder = `<${'0'.repeat(TST_RESERVED_HEX)}>`;

  // Sig dict body. The order of entries matters for byte-offset math:
  // /ByteRange comes before /Contents. We use exactly one space between
  // each token so prettier-like reformatting can't shift offsets.
  const sigDictBody =
    '<<\n' +
    '/Type /DocTimeStamp\n' +
    '/Filter /Adobe.PPKLite\n' +
    '/SubFilter /ETSI.RFC3161\n' +
    '/V 0\n' +
    `/ByteRange ${byteRangePlaceholder}\n` +
    `/Contents ${contentsPlaceholder}\n` +
    '>>';
  const sigDictObj = serializeIndirectObject(sigDictObjNum, 0, sigDictBody);

  // Sig widget annotation. Adobe / EU DSS expect /Widget for /Sig fields.
  const sigWidgetBody =
    '<<\n' +
    '/Type /Annot\n' +
    '/Subtype /Widget\n' +
    '/FT /Sig\n' +
    '/Rect [0 0 0 0]\n' +
    '/T (DocTimestamp1)\n' +
    `/V ${sigDictObjNum} 0 R\n` +
    '/F 132\n' +
    '>>';
  const sigWidgetObj = serializeIndirectObject(sigWidgetObjNum, 0, sigWidgetBody);

  // /AcroForm dict. /SigFlags 3 = signaturesExist | appendOnly. The B-T
  // signature from @signpdf/placeholder-plain already put an /AcroForm on
  // the catalog with its own /Sig field. The new form must keep that
  // field, or readers that take the new /AcroForm no longer list the
  // B-T signature at all. So: prior /Fields first, then the doc
  // timestamp widget.
  const priorFields = readPriorAcroFormFields(pdfText, priorCatalogBody);
  const fields = [...priorFields, `${sigWidgetObjNum} 0 R`].join(' ');
  const acroFormBody = '<<\n' + `/Fields [${fields}]\n` + '/SigFlags 3\n' + '>>';
  const acroFormObj = serializeIndirectObject(acroFormObjNum, 0, acroFormBody);

  // New catalog: copy of prior with its /AcroForm reference (if any)
  // replaced by the merged form. A dict must not carry the key twice.
  const newCatalogBody = appendAcroFormToCatalog(
    removeAcroFormRef(priorCatalogBody),
    acroFormObjNum,
  );
  const newCatalogObj = serializeIndirectObject(
    trailer.rootRef.objNum,
    trailer.rootRef.objGen,
    newCatalogBody,
  );

  // ---- 4. Concatenate the appended block and compute byte offsets.
  const appended: AppendedObject[] = [
    { objNum: sigDictObjNum, objGen: 0, bytes: sigDictObj },
    { objNum: sigWidgetObjNum, objGen: 0, bytes: sigWidgetObj },
    { objNum: acroFormObjNum, objGen: 0, bytes: acroFormObj },
    { objNum: trailer.rootRef.objNum, objGen: trailer.rootRef.objGen, bytes: newCatalogObj },
  ];

  const chunks: Buffer[] = [pdfWithDss, EOL];
  let cursor = pdfWithDss.length + EOL.length;

  // Track the absolute byte offset of the sig-dict body so we know where
  // to patch /ByteRange and /Contents.
  let sigDictAbsoluteStart = -1;

  const objectOffsets = new Map<string, number>();
  for (const obj of appended) {
    if (obj.objNum === sigDictObjNum) {
      sigDictAbsoluteStart = cursor;
    }
    objectOffsets.set(`${obj.objNum} ${obj.objGen}`, cursor);
    chunks.push(obj.bytes);
    cursor += obj.bytes.length;
  }
  if (sigDictAbsoluteStart < 0) {
    throw new Error('archive_timestamp: failed to locate sig dict offset');
  }

  const newXrefOffset = cursor;
  const newSize = Math.max(trailer.size, nextObjNum);
  const xref = serializeXrefSubsection(appended, objectOffsets);
  chunks.push(xref);
  cursor += xref.length;

  const trailerDict = buildTrailerDict({
    size: newSize,
    rootRef: trailer.rootRef,
    priorXrefOffset: startxref,
    infoRef: trailer.infoRef,
    idArrayRaw: trailer.idArrayRaw,
  });
  const trailerBlock = Buffer.from(
    `trailer\n${trailerDict}\nstartxref\n${newXrefOffset}\n%%EOF\n`,
    'binary',
  );
  chunks.push(trailerBlock);

  const assembled = Buffer.concat(chunks);

  // ---- 5. Locate the /ByteRange and /Contents within the assembled
  // buffer. We scan the sig-dict slice (we know its absolute start +
  // length) so we don't rely on the caller's regex parsing.
  const sigDictAbsoluteEnd = sigDictAbsoluteStart + sigDictObj.length;
  const sigDictText = assembled
    .subarray(sigDictAbsoluteStart, sigDictAbsoluteEnd)
    .toString('latin1');

  const brRel = sigDictText.indexOf(byteRangePlaceholder);
  const contentsRel = sigDictText.indexOf(contentsPlaceholder);
  if (brRel < 0 || contentsRel < 0) {
    throw new Error('archive_timestamp: placeholders missing in assembled sig dict');
  }
  const byteRangeAbsolute = sigDictAbsoluteStart + brRel;
  const contentsAbsolute = sigDictAbsoluteStart + contentsRel;

  // PAdES /ByteRange convention: [a b c d] = [start of file, length up
  // to /Contents '<', start of byte after /Contents '>', length to EOF].
  const a = 0;
  const b = contentsAbsolute; // up to but not including '<'
  const c = contentsAbsolute + contentsPlaceholder.length; // after '>'
  const d = assembled.length - c;

  // ---- 6. Patch /ByteRange numbers in-place. We use 10-digit zero-pad
  // so the slot widths match the placeholder.
  const byteRangeReal = `[${pad10(a)} ${pad10(b)} ${pad10(c)} ${pad10(d)}]`;
  if (byteRangeReal.length !== byteRangePlaceholder.length) {
    throw new Error(
      `archive_timestamp: /ByteRange length mismatch (real=${byteRangeReal.length} placeholder=${byteRangePlaceholder.length})`,
    );
  }
  assembled.write(byteRangeReal, byteRangeAbsolute, 'latin1');

  // ---- 7. Ask the TSA to timestamp the byte-ranged bytes. A document
  // timestamp's TSTInfo.messageImprint must be SHA-256(byte range)
  // itself (ETSI EN 319 142-1 §5.4). `TsaClient.timestamp(data)` hashes
  // `data` once to build the imprint, so we hand it the raw range. (It
  // used to get the digest, which made the imprint a double hash that
  // no verifier accepts.)
  const signedRange = Buffer.concat([assembled.subarray(a, a + b), assembled.subarray(c, c + d)]);

  let tsaTokenDer: Buffer;
  try {
    const result = await tsa.timestamp(signedRange);
    tsaTokenDer = result.tokenDer;
    logger.log(`B-LTA archive timestamp granted at ${result.genTime || '(unknown)'}`);
  } catch (err) {
    logger.warn(
      `B-LTA archive timestamp failed; degrading to B-LT: ${err instanceof Error ? err.message : String(err)}`,
    );
    return pdfWithDss;
  }

  if (tsaTokenDer.length > TST_RESERVED_BYTES) {
    throw new Error(
      `archive_timestamp: TST too large for placeholder (${tsaTokenDer.length} > ${TST_RESERVED_BYTES} bytes); increase TST_RESERVED_BYTES`,
    );
  }

  // ---- 8. Patch /Contents in-place. Skip the leading '<', write hex,
  // pad with '0' to fill the reserved slot.
  const tstHex = tsaTokenDer.toString('hex');
  const padded = tstHex + '0'.repeat(TST_RESERVED_HEX - tstHex.length);
  // Position of the FIRST hex char = contentsAbsolute + 1 (skip '<').
  assembled.write(padded, contentsAbsolute + 1, 'latin1');

  return assembled;
}

// ---------------------------------------------------------------------------
// Internal helpers (mirror dss-incremental-update.ts patterns).
// ---------------------------------------------------------------------------

interface ObjectRef {
  readonly objNum: number;
  readonly objGen: number;
}
interface AppendedObject {
  readonly objNum: number;
  readonly objGen: number;
  readonly bytes: Buffer;
}
interface ParsedTrailer {
  readonly size: number;
  readonly rootRef: ObjectRef;
  readonly infoRef: ObjectRef | null;
  readonly idArrayRaw: string | null;
}

const TRAILER_RE = /trailer\s*<<([\s\S]+?)>>\s*startxref/g;
const SIZE_RE = /\/Size\s+(\d+)/;
const ROOT_RE = /\/Root\s+(\d+)\s+(\d+)\s+R/;
const INFO_RE = /\/Info\s+(\d+)\s+(\d+)\s+R/;
const ID_RE = /\/ID\s*(\[[^\]]+\])/;
const STARTXREF_RE = /startxref\s+(\d+)\s+%%EOF\s*$/;

function parseLastTrailer(text: string): ParsedTrailer {
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  TRAILER_RE.lastIndex = 0;
  while ((m = TRAILER_RE.exec(text)) !== null) {
    lastMatch = m;
  }
  if (!lastMatch) {
    throw new Error('archive_timestamp: no /trailer dict found');
  }
  const body = lastMatch[1] ?? '';
  const sizeMatch = SIZE_RE.exec(body);
  const rootMatch = ROOT_RE.exec(body);
  if (!sizeMatch || !rootMatch) {
    throw new Error('archive_timestamp: trailer missing /Size or /Root');
  }
  const infoMatch = INFO_RE.exec(body);
  const idMatch = ID_RE.exec(body);
  return {
    size: parseInt(sizeMatch[1]!, 10),
    rootRef: {
      objNum: parseInt(rootMatch[1]!, 10),
      objGen: parseInt(rootMatch[2]!, 10),
    },
    infoRef: infoMatch
      ? { objNum: parseInt(infoMatch[1]!, 10), objGen: parseInt(infoMatch[2]!, 10) }
      : null,
    idArrayRaw: idMatch ? idMatch[1]! : null,
  };
}

function findStartxref(pdf: Buffer): number {
  const tailLen = Math.min(pdf.length, 4096);
  const tail = pdf.subarray(pdf.length - tailLen).toString('latin1');
  const match = STARTXREF_RE.exec(tail) ?? /startxref\s+(\d+)/g.exec(tail);
  if (!match || !match[1]) {
    throw new Error('archive_timestamp: cannot locate startxref offset');
  }
  return parseInt(match[1], 10);
}

function readObjectBody(text: string, ref: ObjectRef): string {
  const marker = `${ref.objNum} ${ref.objGen} obj`;
  // The marker must start a token: a plain lastIndexOf('2 0 obj') also
  // hits '12 0 obj', and a DSS with a few certs and OCSP responses easily
  // reaches object 12. Take the last match whose preceding byte is PDF
  // whitespace (or the file start).
  const markerRe = new RegExp(`(?:^|[\\s])${ref.objNum}\\s+${ref.objGen}\\s+obj\\b`, 'g');
  let objStart = -1;
  let matchLen = 0;
  let mm: RegExpExecArray | null;
  while ((mm = markerRe.exec(text)) !== null) {
    objStart = mm.index;
    matchLen = mm[0].length;
  }
  if (objStart < 0) {
    throw new Error(`archive_timestamp: cannot locate object ${marker}`);
  }
  const bodyStart = objStart + matchLen;
  const endIdx = text.indexOf('endobj', bodyStart);
  if (endIdx < 0) {
    throw new Error(`archive_timestamp: cannot locate endobj for ${marker}`);
  }
  return text.slice(bodyStart, endIdx).trim();
}

const ACROFORM_REF_RE = /\/AcroForm\s+(\d+)\s+(\d+)\s+R/;

/**
 * The indirect refs listed in the prior catalog's /AcroForm /Fields, in
 * order. Empty when the catalog has no /AcroForm. An inline /AcroForm
 * dict is not something our pipeline writes, so it throws; the caller
 * (DssInjector) then keeps the B-LT bytes.
 */
function readPriorAcroFormFields(text: string, catalogBody: string): string[] {
  const ref = ACROFORM_REF_RE.exec(catalogBody);
  if (!ref) {
    if (/\/AcroForm\s*<</.test(catalogBody)) {
      throw new Error('archive_timestamp: inline /AcroForm dict on catalog is not supported');
    }
    return [];
  }
  const formBody = readObjectBody(text, {
    objNum: parseInt(ref[1]!, 10),
    objGen: parseInt(ref[2]!, 10),
  });
  const fieldsMatch = /\/Fields\s*\[([^\]]*)\]/.exec(formBody);
  if (!fieldsMatch) return [];
  const refs: string[] = [];
  const refRe = /(\d+)\s+(\d+)\s+R/g;
  let m: RegExpExecArray | null;
  while ((m = refRe.exec(fieldsMatch[1] ?? '')) !== null) {
    refs.push(`${m[1]} ${m[2]} R`);
  }
  return refs;
}

function removeAcroFormRef(catalogBody: string): string {
  return catalogBody.replace(ACROFORM_REF_RE, '');
}

function appendAcroFormToCatalog(priorBody: string, acroFormObjNum: number): string {
  const startIdx = priorBody.indexOf('<<');
  const endIdx = priorBody.lastIndexOf('>>');
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('archive_timestamp: prior catalog is not a valid << ... >> dict');
  }
  const head = priorBody.slice(0, endIdx);
  const tail = priorBody.slice(endIdx);
  const entry = ` /AcroForm ${acroFormObjNum} 0 R `;
  return `${head}${entry}${tail}`;
}

function serializeIndirectObject(objNum: number, objGen: number, body: string): Buffer {
  return Buffer.from(`${objNum} ${objGen} obj\n${body}\nendobj\n`, 'binary');
}

/**
 * Build a single xref subsection covering all appended objects. We emit
 * one entry per object number (no merging across non-contiguous ranges)
 * — this matches PDF 1.7 §7.5.4: an xref section can have multiple
 * subsections, each with its own `<first> <count>` header.
 */
function serializeXrefSubsection(
  appended: ReadonlyArray<AppendedObject>,
  offsets: ReadonlyMap<string, number>,
): Buffer {
  // Sort by object number so we emit subsections in ascending order.
  const sorted = [...appended].sort((a, b) => a.objNum - b.objNum);
  const subsections: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1]!.objNum === sorted[j]!.objNum + 1) {
      j++;
    }
    const first = sorted[i]!.objNum;
    const count = j - i + 1;
    let block = `${first} ${count}\n`;
    for (let k = i; k <= j; k++) {
      const obj = sorted[k]!;
      const off = offsets.get(`${obj.objNum} ${obj.objGen}`);
      if (off === undefined) {
        throw new Error(`archive_timestamp: missing offset for ${obj.objNum} ${obj.objGen}`);
      }
      block += `${off.toString().padStart(10, '0')} ${obj.objGen.toString().padStart(5, '0')} n \n`;
    }
    subsections.push(block);
    i = j + 1;
  }
  return Buffer.from(`xref\n${subsections.join('')}`, 'binary');
}

interface TrailerDictInput {
  readonly size: number;
  readonly rootRef: ObjectRef;
  readonly priorXrefOffset: number;
  readonly infoRef: ObjectRef | null;
  readonly idArrayRaw: string | null;
}

function buildTrailerDict(input: TrailerDictInput): string {
  let dict = '<<';
  dict += ` /Size ${input.size}`;
  dict += ` /Root ${input.rootRef.objNum} ${input.rootRef.objGen} R`;
  if (input.infoRef) {
    dict += ` /Info ${input.infoRef.objNum} ${input.infoRef.objGen} R`;
  }
  dict += ` /Prev ${input.priorXrefOffset}`;
  if (input.idArrayRaw) {
    dict += ` /ID ${input.idArrayRaw}`;
  }
  dict += ' >>';
  return dict;
}

function pad10(n: number): string {
  return n.toString().padStart(10, '0');
}
