import { apiClient, type ApiError } from '@/lib/api/apiClient';

export type ConvertFailure = 'type' | 'size' | 'failed';

/** Thrown by `convertUploadToPdf`; `reason` maps onto the dropzone error states. */
export class ConvertUploadError extends Error {
  readonly reason: ConvertFailure;
  constructor(reason: ConvertFailure, message: string) {
    super(message);
    this.name = 'ConvertUploadError';
    this.reason = reason;
  }
}

const WORD_EXT = /\.(docx?|DOCX?)$/;
const WORD_MIMES: ReadonlyArray<string> = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

/** True for a Word file by MIME or extension (browsers sometimes send no MIME). */
export function isWordFile(file: File): boolean {
  return WORD_MIMES.includes(file.type) || WORD_EXT.test(file.name);
}

/** The file name a converted Word file carries: same stem, `.pdf`. */
export function pdfNameFor(name: string): string {
  return WORD_EXT.test(name) ? name.replace(WORD_EXT, '.pdf') : `${name}.pdf`;
}

/**
 * Sends a Word file to `POST /uploads/convert` and returns the PDF it comes
 * back as. Errors map onto the upload screen's states: 415 is a wrong type,
 * 413 is too big, anything else is a failed conversion.
 */
export async function convertUploadToPdf(file: File, signal?: AbortSignal): Promise<File> {
  const fd = new FormData();
  fd.append('file', file);
  try {
    const { data } = await apiClient.post<Blob>('/uploads/convert', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
      ...(signal ? { signal } : {}),
    });
    return new File([data], pdfNameFor(file.name), { type: 'application/pdf' });
  } catch (err) {
    const status = (err as ApiError).status;
    if (status === 415) throw new ConvertUploadError('type', 'PDF or Word only');
    if (status === 413) throw new ConvertUploadError('size', 'Max 25 MB');
    throw new ConvertUploadError('failed', "Couldn't convert");
  }
}
