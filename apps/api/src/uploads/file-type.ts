/**
 * Upload type checks from magic bytes, never the file name (MCP doc,
 * `documents_upload`). PDF is taken as-is; a .docx (an OOXML zip with a
 * `word/document.xml` part) is converted to PDF; anything else is refused.
 */
export type StagedFileKind = 'pdf' | 'docx';

const PDF_MAGIC = Buffer.from('%PDF-', 'latin1');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const DOCX_PART = Buffer.from('word/document.xml', 'latin1');

export function detectStagedFileKind(bytes: Buffer): StagedFileKind | null {
  if (bytes.length >= PDF_MAGIC.length && bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return 'pdf';
  }
  if (
    bytes.length >= ZIP_MAGIC.length &&
    bytes.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC) &&
    bytes.includes(DOCX_PART)
  ) {
    return 'docx';
  }
  return null;
}

/** Strict base64 (standard alphabet, optional padding). Null when malformed. */
export function decodeBase64Strict(text: string): Buffer | null {
  const clean = text.replace(/\s+/g, '');
  if (clean.length === 0 || clean.length % 4 === 1) return null;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) return null;
  return Buffer.from(clean, 'base64');
}
