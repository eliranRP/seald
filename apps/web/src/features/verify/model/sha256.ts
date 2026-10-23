/** Largest PDF the verify page hashes in the browser. */
export const MAX_VERIFY_FILE_BYTES = 25 * 1024 * 1024;

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function readBytes(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * SHA-256 of a file as lowercase hex, computed locally with SubtleCrypto.
 * The bytes never leave the browser; only the digest is ever sent.
 */
export async function sha256Hex(file: Blob): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('subtle_crypto_unavailable');
  return toHex(await subtle.digest('SHA-256', await readBytes(file)));
}

export type FileCheckProblem = 'not_pdf' | 'too_large';

/** Reasons to refuse a dropped file before hashing it; null when fine. */
export function fileProblem(file: File): FileCheckProblem | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return 'not_pdf';
  if (file.size > MAX_VERIFY_FILE_BYTES) return 'too_large';
  return null;
}
