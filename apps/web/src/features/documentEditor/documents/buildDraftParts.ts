import { readPdfInfo } from '@/lib/pdf';
import { MAX_DRAFT_DOCUMENTS, newPartId, titleFromFile } from './model';
import type { DraftDocumentPart } from './model';

export interface BuiltDraftParts {
  readonly parts: ReadonlyArray<DraftDocumentPart>;
  /** File names that could not be read as a PDF and were left out. */
  readonly failed: ReadonlyArray<string>;
}

/**
 * Turns the files picked on the upload page into draft document parts, in
 * pick order (WP-04). A file that does not parse is left out and reported;
 * at most MAX_DRAFT_DOCUMENTS are kept.
 */
export async function buildDraftParts(files: ReadonlyArray<File>): Promise<BuiltDraftParts> {
  const parts: DraftDocumentPart[] = [];
  const failed: string[] = [];
  for (const file of files.slice(0, MAX_DRAFT_DOCUMENTS)) {
    try {
      const info = await readPdfInfo(file);
      parts.push({
        id: newPartId(),
        title: titleFromFile(file),
        file,
        totalPages: Math.max(1, info.pages),
        aspect: info.aspect,
      });
    } catch {
      failed.push(file.name);
    }
  }
  return { parts, failed };
}
