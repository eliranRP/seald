import { MAX_ENVELOPE_DOCUMENTS } from 'shared';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';

/**
 * One PDF in a local sender draft (WP-04). While a draft holds a single
 * PDF it has no parts at all and behaves exactly as before; the first
 * extra document turns the draft into an ordered list of parts. The
 * draft's own `file` / `totalPages` always mirror the first part so every
 * legacy reader keeps working.
 */
export interface DraftDocumentPart {
  readonly id: string;
  readonly title: string;
  readonly file: File;
  readonly totalPages: number;
  /**
   * Height / width of page 1. Field coordinates are stored in canvas
   * pixels, and the canvas height follows this ratio, so each document
   * needs its own to normalize its fields when the draft is sent.
   */
  readonly aspect: number;
}

export const MAX_DRAFT_DOCUMENTS = MAX_ENVELOPE_DOCUMENTS;
/** Same cap the single-file upload enforces. */
const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export function newPartId(): string {
  return `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFromFile(file: File): string {
  const base = file.name.replace(/\.pdf$/i, '').trim();
  return base.length > 0 ? base.slice(0, 200) : 'Untitled document';
}

interface FileCheck {
  readonly ok: ReadonlyArray<File>;
  readonly rejected: ReadonlyArray<{ readonly name: string; readonly reason: 'type' | 'size' }>;
}

/** Splits picked files into usable PDFs and rejects (wrong type / too large). */
export function checkPdfFiles(files: ReadonlyArray<File>): FileCheck {
  const ok: File[] = [];
  const rejected: { name: string; reason: 'type' | 'size' }[] = [];
  for (const f of files) {
    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) rejected.push({ name: f.name, reason: 'type' });
    else if (f.size > MAX_DOCUMENT_BYTES) rejected.push({ name: f.name, reason: 'size' });
    else ok.push(f);
  }
  return { ok, rejected };
}

/** Moves one item and returns a new list (a plain copy when `from` is out of range). */
export function moveItem<T>(list: ReadonlyArray<T>, from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const clamped = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(clamped, 0, item);
  return next;
}

/**
 * The part a field sits on. A field without a `documentId` predates the
 * list and belongs to the first part.
 */
export function documentIdOf(
  field: PlacedFieldValue,
  parts: ReadonlyArray<DraftDocumentPart>,
): string | undefined {
  return field.documentId ?? parts[0]?.id;
}

export function fieldsForDocument(
  fields: ReadonlyArray<PlacedFieldValue>,
  parts: ReadonlyArray<DraftDocumentPart>,
  documentId: string,
): PlacedFieldValue[] {
  return fields.filter((f) => documentIdOf(f, parts) === documentId);
}

/**
 * Replaces the active document's slice of the field list with `next`
 * (what the editor hands back), stamping `documentId` on each, and keeps
 * the other documents' fields untouched and in order.
 */
export function mergeDocumentFields(
  all: ReadonlyArray<PlacedFieldValue>,
  parts: ReadonlyArray<DraftDocumentPart>,
  documentId: string,
  next: ReadonlyArray<PlacedFieldValue>,
): PlacedFieldValue[] {
  const others = all.filter((f) => documentIdOf(f, parts) !== documentId);
  const mine = next.map((f) => (f.documentId === documentId ? f : { ...f, documentId }));
  return [...others, ...mine];
}

/** Pins every unowned field to the first part (run once when parts are created). */
export function stampFirstDocument(
  fields: ReadonlyArray<PlacedFieldValue>,
  firstId: string,
): PlacedFieldValue[] {
  return fields.map((f) => (f.documentId === undefined ? { ...f, documentId: firstId } : f));
}

export function removeDocumentFields(
  fields: ReadonlyArray<PlacedFieldValue>,
  parts: ReadonlyArray<DraftDocumentPart>,
  documentId: string,
): PlacedFieldValue[] {
  return fields.filter((f) => documentIdOf(f, parts) !== documentId);
}
