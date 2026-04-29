/**
 * ISO 32000-1 §7.5.6 incremental-update writer for embedding a /DSS
 * dictionary onto an already-signed PDF.
 *
 * This is the production-grade alternative to a `pdf.save()` re-serialize.
 * The original PDF bytes are NEVER touched: we APPEND new objects + a
 * new xref subsection + a new trailer + a fresh `%%EOF` to the end of
 * the file. The pre-existing PAdES B-T signature's `/ByteRange` and
 * `/Sig.Contents` therefore remain byte-identical, so the existing
 * signature still verifies after this upgrade.
 *
 * Why this works (esignature-standards-expert §5):
 *
 *   PAdES B-T `/ByteRange` covers everything in the file EXCEPT the
 *   placeholder bytes inside `/Sig.Contents`. ISO 32000-1 §7.5.6 says
 *   readers must concatenate the original body + every incremental
 *   update body when reading the document, but the original `/ByteRange`
 *   still hashes only the original bytes (because the trailing update
 *   is not in the byte range). So the signature stays valid AND the
 *   verifier picks up the new /DSS at the document level.
 *
 * What we append, in order:
 *
 *   <object_1_definition>
 *   <object_2_definition>
 *   ...
 *   <new_catalog_object>     // copy of the prior catalog with a /DSS entry added
 *   xref
 *   0 1
 *   0000000000 65535 f
 *   <obj#> 1
 *   <byte offset> 00000 n
 *   ...
 *   trailer
 *   << /Size <count> /Root <new_catalog_ref> /Prev <prior_xref_offset> >>
 *   startxref
 *   <new_xref_offset>
 *   %%EOF
 */

import { Buffer } from 'node:buffer';

const NEWLINE = '\n';
const EOL = Buffer.from(NEWLINE, 'binary');

export interface IncrementalUpdateInput {
  readonly originalPdf: Buffer;
  readonly certs: ReadonlyArray<Buffer>;
  readonly ocsps: ReadonlyArray<Buffer>;
  readonly crls: ReadonlyArray<Buffer>;
}

export function appendDssIncrementalUpdate(input: IncrementalUpdateInput): Buffer {
  const { originalPdf, certs, ocsps, crls } = input;

  if (certs.length === 0 && ocsps.length === 0 && crls.length === 0) {
    // Nothing to embed — return original verbatim. This matches the
    // skip-paths in DssInjector (no signer/TSA chains parseable).
    return originalPdf;
  }

  const trailer = parseTrailer(originalPdf);
  const startxref = findStartxref(originalPdf);

  // Each appended stream object gets a fresh object number after the
  // existing high-water mark. Reserve one extra slot for the new
  // catalog object that overrides the prior catalog.
  let nextObjNum = trailer.size; // /Size = highest_obj_num + 1, so next free = /Size

  type AppendedObject = {
    readonly objNum: number;
    readonly objGen: number;
    readonly bytes: Buffer; // raw indirect-object body (header + endobj)
  };

  const appended: AppendedObject[] = [];

  function pushStream(content: Buffer): number {
    const num = nextObjNum++;
    appended.push({
      objNum: num,
      objGen: 0,
      bytes: serializeStreamObject(num, 0, content),
    });
    return num;
  }

  const certRefs = certs.map((b) => pushStream(b));
  const ocspRefs = ocsps.map((b) => pushStream(b));
  const crlRefs = crls.map((b) => pushStream(b));

  // Build the /DSS dictionary as an indirect object so the catalog can
  // reference it. ETSI EN 319 142-1 §6.3 lets DSS be either inline or
  // an indirect ref; verifiers handle both. Indirect is cleaner.
  const dssObjNum = nextObjNum++;
  const dssBody = serializeDssDictionary(dssObjNum, 0, {
    certs: certRefs,
    ocsps: ocspRefs,
    crls: crlRefs,
  });
  appended.push({ objNum: dssObjNum, objGen: 0, bytes: dssBody });

  // Build the new catalog object. We copy the prior catalog dict
  // verbatim and tack on `/DSS <ref>`. The catalog keeps its original
  // object number + generation so any other indirect ref into it
  // (e.g. /AcroForm) stays valid.
  const priorCatalog = readObject(originalPdf, trailer.rootRef);
  const newCatalogBody = appendDssEntryToCatalog(
    trailer.rootRef.objNum,
    trailer.rootRef.objGen,
    priorCatalog,
    dssObjNum,
  );

  // The catalog override is a fresh revision of object N — DEFLATE the
  // generation by 0 so we keep gen=0; readers walking the xref chain
  // pick up the latest revision via /Prev.
  appended.push({
    objNum: trailer.rootRef.objNum,
    objGen: trailer.rootRef.objGen,
    bytes: newCatalogBody,
  });

  // Now serialize. We need every appended object's BYTE OFFSET in the
  // final file (= original PDF length + cumulative offset within the
  // appended block). Walk in append order and compute as we concat.

  const chunks: Buffer[] = [originalPdf];
  // ISO 32000-1 §7.5.6: incremental update body must start on a fresh
  // line. We always insert a newline separator to guarantee this even
  // if the prior %%EOF didn't end with one.
  chunks.push(EOL);
  let cursor = originalPdf.length + EOL.length;

  const objectOffsets = new Map<string, number>(); // "num gen" -> byte offset
  for (const obj of appended) {
    objectOffsets.set(`${obj.objNum} ${obj.objGen}`, cursor);
    chunks.push(obj.bytes);
    cursor += obj.bytes.length;
  }

  const newXrefOffset = cursor;

  const newSize = Math.max(trailer.size, nextObjNum);
  const xref = serializeXrefSubsection(appended, objectOffsets);
  chunks.push(xref);
  cursor += xref.length;

  // Build the new trailer dict.
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

  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// PDF parsing helpers — minimal, only what we need from the trailer to
// chain a new revision. We do NOT parse the full xref table; we only
// need /Size, /Root ref, /Info ref (optional), /ID, and the prior
// startxref offset.
// ---------------------------------------------------------------------------

interface ObjectRef {
  readonly objNum: number;
  readonly objGen: number;
}

interface ParsedTrailer {
  readonly size: number;
  readonly rootRef: ObjectRef;
  readonly infoRef: ObjectRef | null;
  /** Raw bytes of the /ID array entry (e.g. `[<...><...>]`) for re-use. */
  readonly idArrayRaw: string | null;
}

const TRAILER_RE = /trailer\s*<<([\s\S]+?)>>\s*startxref/g;
const SIZE_RE = /\/Size\s+(\d+)/;
const ROOT_RE = /\/Root\s+(\d+)\s+(\d+)\s+R/;
const INFO_RE = /\/Info\s+(\d+)\s+(\d+)\s+R/;
const ID_RE = /\/ID\s*(\[[^\]]+\])/;

function parseTrailer(pdf: Buffer): ParsedTrailer {
  const text = pdf.toString('latin1');
  // Take the LAST trailer in the file — if the PDF already had
  // incremental updates, we extend the latest revision.
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  TRAILER_RE.lastIndex = 0;
  while ((match = TRAILER_RE.exec(text)) !== null) {
    lastMatch = match;
  }
  if (!lastMatch) {
    throw new Error('dss_incremental: no /trailer dict found');
  }
  const body = lastMatch[1] ?? '';
  const sizeMatch = SIZE_RE.exec(body);
  const rootMatch = ROOT_RE.exec(body);
  if (!sizeMatch || !rootMatch) {
    throw new Error('dss_incremental: trailer is missing /Size or /Root');
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

const STARTXREF_RE = /startxref\s+(\d+)\s+%%EOF\s*$/;

function findStartxref(pdf: Buffer): number {
  // Look in the last 1KB of the file (per ISO §7.5.5 — startxref is at
  // file end). Read more if the file is small.
  const tailLen = Math.min(pdf.length, 4096);
  const tail = pdf.subarray(pdf.length - tailLen).toString('latin1');
  const match = STARTXREF_RE.exec(tail) ?? /startxref\s+(\d+)/g.exec(tail);
  if (!match || !match[1]) {
    throw new Error('dss_incremental: cannot locate startxref offset');
  }
  return parseInt(match[1], 10);
}

/**
 * Read the body of an indirect object from the original PDF. We don't
 * need a full PDF parser — we just locate `<num> <gen> obj … endobj`
 * and return the body text between the markers.
 *
 * Used to extract the prior catalog dictionary so we can copy it +
 * append a new /DSS entry to it.
 */
function readObject(pdf: Buffer, ref: ObjectRef): string {
  const text = pdf.toString('latin1');
  // Naive but adequate: search for the LAST occurrence of "<n> <g> obj"
  // (last so we follow incremental-update revisions). Robustness note:
  // this is good enough for our seal pipeline output (single-revision
  // PDFs from pdf-lib + @signpdf). For a fully general parser we'd
  // walk the xref table.
  const marker = `${ref.objNum} ${ref.objGen} obj`;
  const objStart = text.lastIndexOf(marker);
  if (objStart < 0) {
    throw new Error(`dss_incremental: cannot locate object ${marker}`);
  }
  const bodyStart = objStart + marker.length;
  const endIdx = text.indexOf('endobj', bodyStart);
  if (endIdx < 0) {
    throw new Error(`dss_incremental: cannot locate endobj for ${marker}`);
  }
  return text.slice(bodyStart, endIdx).trim();
}

/**
 * Append `/DSS <ref>` onto the prior catalog dictionary body. The body
 * is whatever was between `obj` and `endobj` — a balanced << ... >>
 * dictionary plus optional whitespace.
 *
 * We don't reparse it. We just locate the OUTERMOST closing `>>` and
 * insert ` /DSS <num> <gen> R` immediately before it. This preserves
 * EVERY entry in the prior catalog (e.g. /Pages, /AcroForm, /Names,
 * /Metadata, /OpenAction, /URI, /Lang, …) byte-for-byte.
 */
function appendDssEntryToCatalog(
  objNum: number,
  objGen: number,
  priorBody: string,
  dssObjNum: number,
): Buffer {
  const startIdx = priorBody.indexOf('<<');
  const endIdx = priorBody.lastIndexOf('>>');
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('dss_incremental: prior catalog is not a valid << … >> dict');
  }
  const head = priorBody.slice(0, endIdx);
  const tail = priorBody.slice(endIdx); // includes the closing >>
  const dssEntry = ` /DSS ${dssObjNum} 0 R `;
  const newBody = `${head}${dssEntry}${tail}`;
  return Buffer.from(`${objNum} ${objGen} obj\n${newBody}\nendobj\n`, 'binary');
}

// ---------------------------------------------------------------------------
// Object serializers
// ---------------------------------------------------------------------------

function serializeStreamObject(objNum: number, objGen: number, content: Buffer): Buffer {
  // ISO 32000-1 §7.3.8.2: stream dict MUST have /Length matching the
  // raw byte count BETWEEN `stream\n` and `\nendstream`. We don't apply
  // any filter — DER bytes go in raw and the verifier reads them raw.
  const dict = `<< /Length ${content.length} >>`;
  const header = Buffer.from(`${objNum} ${objGen} obj\n${dict}\nstream\n`, 'binary');
  const footer = Buffer.from(`\nendstream\nendobj\n`, 'binary');
  return Buffer.concat([header, content, footer]);
}

interface DssRefs {
  readonly certs: ReadonlyArray<number>;
  readonly ocsps: ReadonlyArray<number>;
  readonly crls: ReadonlyArray<number>;
}

function serializeDssDictionary(objNum: number, objGen: number, refs: DssRefs): Buffer {
  // ETSI EN 319 142-1 §6.3 — /DSS optionally has /Certs, /CRLs, /OCSPs
  // arrays of indirect refs. Empty arrays are omitted (some verifiers
  // are stricter about presence than emptiness).
  const parts: string[] = ['/Type /DSS'];
  if (refs.certs.length > 0) {
    parts.push(`/Certs [${refs.certs.map((n) => `${n} 0 R`).join(' ')}]`);
  }
  if (refs.ocsps.length > 0) {
    parts.push(`/OCSPs [${refs.ocsps.map((n) => `${n} 0 R`).join(' ')}]`);
  }
  if (refs.crls.length > 0) {
    parts.push(`/CRLs [${refs.crls.map((n) => `${n} 0 R`).join(' ')}]`);
  }
  const dict = `<< ${parts.join(' ')} >>`;
  return Buffer.from(`${objNum} ${objGen} obj\n${dict}\nendobj\n`, 'binary');
}

// ---------------------------------------------------------------------------
// xref subsection serializer (classic format, not cross-reference stream)
// ---------------------------------------------------------------------------

/**
 * Serialize the appended xref subsection. ISO 32000-1 §7.5.4 specifies
 * the format:
 *
 *   xref\n
 *   <subsection_first_obj> <count>\n
 *   <10-digit-offset> <5-digit-gen> n\n
 *   <10-digit-offset> <5-digit-gen> n\n
 *   ...
 *
 * For an incremental update we emit ONE subsection per contiguous run
 * of new/modified object numbers.
 *
 * Why subsections matter: an incremental update may modify a low
 * object number (e.g. the catalog at obj 1) AND add high-numbered new
 * objects. Those don't form a single contiguous range, so we group
 * them.
 */
function serializeXrefSubsection(
  appended: ReadonlyArray<{ readonly objNum: number; readonly objGen: number }>,
  objectOffsets: Map<string, number>,
): Buffer {
  const sortedByNum = [...appended].sort((a, b) => a.objNum - b.objNum);

  const subsections: Array<{ readonly first: number; readonly entries: string[] }> = [];
  let current: { first: number; entries: string[] } | null = null;
  let lastNum = -2;

  for (const obj of sortedByNum) {
    const offset = objectOffsets.get(`${obj.objNum} ${obj.objGen}`);
    if (offset === undefined) {
      throw new Error(`dss_incremental: missing offset for ${obj.objNum} ${obj.objGen}`);
    }
    const entry = `${pad10(offset)} ${pad5(obj.objGen)} n \n`;

    if (obj.objNum === lastNum + 1 && current !== null) {
      current.entries.push(entry);
    } else {
      current = { first: obj.objNum, entries: [entry] };
      subsections.push(current);
    }
    lastNum = obj.objNum;
  }

  let out = 'xref\n';
  for (const sub of subsections) {
    out += `${sub.first} ${sub.entries.length}\n`;
    out += sub.entries.join('');
  }
  return Buffer.from(out, 'binary');
}

function pad10(n: number): string {
  return n.toString().padStart(10, '0');
}
function pad5(n: number): string {
  return n.toString().padStart(5, '0');
}

// ---------------------------------------------------------------------------
// Trailer dictionary builder
// ---------------------------------------------------------------------------

interface TrailerInput {
  readonly size: number;
  readonly rootRef: ObjectRef;
  readonly infoRef: ObjectRef | null;
  readonly priorXrefOffset: number;
  readonly idArrayRaw: string | null;
}

function buildTrailerDict(input: TrailerInput): string {
  const parts: string[] = [];
  parts.push(`/Size ${input.size}`);
  parts.push(`/Root ${input.rootRef.objNum} ${input.rootRef.objGen} R`);
  if (input.infoRef !== null) {
    parts.push(`/Info ${input.infoRef.objNum} ${input.infoRef.objGen} R`);
  }
  parts.push(`/Prev ${input.priorXrefOffset}`);
  if (input.idArrayRaw !== null) {
    // PDF 1.7 §14.4 strongly recommends preserving /ID across
    // incremental updates — Adobe Reader uses it to detect
    // out-of-band tampering.
    parts.push(`/ID ${input.idArrayRaw}`);
  }
  return `<< ${parts.join(' ')} >>`;
}
