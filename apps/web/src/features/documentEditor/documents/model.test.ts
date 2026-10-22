import { describe, expect, it } from 'vitest';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import {
  checkPdfFiles,
  documentIdOf,
  fieldsForDocument,
  mergeDocumentFields,
  moveItem,
  removeDocumentFields,
  stampFirstDocument,
  titleFromFile,
} from './model';
import type { DraftDocumentPart } from './model';

function part(id: string): DraftDocumentPart {
  return { id, title: id, file: new File(['x'], `${id}.pdf`), totalPages: 1, aspect: 1.3 };
}

function field(id: string, documentId?: string): PlacedFieldValue {
  return { id, page: 1, type: 'signature', x: 0, y: 0, signerIds: ['s'], documentId };
}

const PARTS = [part('a'), part('b')];

describe('moveItem', () => {
  it('moves an item and leaves the input alone', () => {
    const input = ['a', 'b', 'c'];
    expect(moveItem(input, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(input, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(input).toEqual(['a', 'b', 'c']);
  });

  it('clamps the target and ignores a bad source', () => {
    expect(moveItem(['a', 'b'], 0, 9)).toEqual(['b', 'a']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});

describe('checkPdfFiles', () => {
  it('separates PDFs from other types and from oversized files', () => {
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    const { ok, rejected } = checkPdfFiles([
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
      new File(['x'], 'b.PDF', { type: '' }),
      new File(['x'], 'c.docx', { type: 'application/msword' }),
      big,
    ]);
    expect(ok.map((f) => f.name)).toEqual(['a.pdf', 'b.PDF']);
    expect(rejected).toEqual([
      { name: 'c.docx', reason: 'type' },
      { name: 'big.pdf', reason: 'size' },
    ]);
  });
});

describe('titleFromFile', () => {
  it('drops the extension and falls back for an empty name', () => {
    expect(titleFromFile(new File(['x'], 'Lease v2.pdf'))).toBe('Lease v2');
    expect(titleFromFile(new File(['x'], '.pdf'))).toBe('Untitled document');
  });
});

describe('per-document fields', () => {
  it('treats a field with no documentId as sitting on the first document', () => {
    expect(documentIdOf(field('f1'), PARTS)).toBe('a');
    expect(documentIdOf(field('f2', 'b'), PARTS)).toBe('b');
  });

  it('selects the fields of one document', () => {
    const all = [field('f1'), field('f2', 'b'), field('f3', 'a')];
    expect(fieldsForDocument(all, PARTS, 'a').map((f) => f.id)).toEqual(['f1', 'f3']);
    expect(fieldsForDocument(all, PARTS, 'b').map((f) => f.id)).toEqual(['f2']);
  });

  it('merges what the editor hands back into the active document only', () => {
    const all = [field('f1', 'a'), field('f2', 'b')];
    const merged = mergeDocumentFields(all, PARTS, 'b', [field('f2', 'b'), field('f9')]);
    expect(merged.map((f) => [f.id, f.documentId])).toEqual([
      ['f1', 'a'],
      ['f2', 'b'],
      ['f9', 'b'],
    ]);
  });

  it('pins unowned fields to the first document once, and removes a document with its fields', () => {
    const stamped = stampFirstDocument([field('f1'), field('f2', 'b')], 'a');
    expect(stamped.map((f) => f.documentId)).toEqual(['a', 'b']);
    expect(removeDocumentFields(stamped, PARTS, 'a').map((f) => f.id)).toEqual(['f2']);
  });
});
