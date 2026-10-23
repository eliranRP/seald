import { useState } from 'react';
import type { RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { AppDocument } from '@/lib/mockApi';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';

vi.mock('@/lib/pdf', () => ({
  readPdfInfo: vi.fn(async (file: File) => {
    if (file.name.startsWith('bad')) throw new Error('not a pdf');
    return { pages: file.name.startsWith('long') ? 5 : 2, aspect: 1.5 };
  }),
}));

import { useDraftDocuments } from './useDraftDocuments';

function pdf(name: string): File {
  return new File(['x'], name, { type: 'application/pdf' });
}

function field(id: string, documentId?: string): PlacedFieldValue {
  return { id, page: 1, type: 'signature', x: 0, y: 0, signerIds: ['s'], documentId };
}

function baseDraft(overrides: Partial<AppDocument> = {}): AppDocument {
  return {
    id: 'draft-1',
    title: 'Master agreement',
    code: 'DOC-1',
    status: 'draft',
    fields: [],
    signers: [],
    updatedAt: '2026-10-22T00:00:00.000Z',
    file: pdf('master.pdf'),
    totalPages: 3,
    ...overrides,
  };
}

const heightRef: RefObject<number> = { current: 700 };

/** Stateful host so `update` feeds the next render, like AppStateProvider. */
function useHarness(initial: AppDocument, enabled = true) {
  const [draft, setDraft] = useState(initial);
  const drafts = useDraftDocuments({
    enabled,
    draft,
    update: (_id, patch) => setDraft((d) => ({ ...d, ...patch })),
    canvasHeightRef: heightRef,
  });
  return { draft, drafts };
}

describe('useDraftDocuments', () => {
  it('leaves a single-PDF draft exactly as it was', () => {
    const { result } = renderHook(() => useHarness(baseDraft({ fields: [field('f1')] })));
    expect(result.current.drafts.parts).toEqual([]);
    expect(result.current.drafts.multi).toBe(false);
    expect(result.current.drafts.activePart).toBeUndefined();
    expect(result.current.drafts.visibleFields.map((f) => f.id)).toEqual(['f1']);
    expect(result.current.drafts.listItems).toEqual([
      { id: 'primary', title: 'Master agreement', pages: 3 },
    ]);
  });

  it('does nothing when disabled', async () => {
    const { result } = renderHook(() => useHarness(baseDraft({ documents: [] }), false));
    expect(result.current.drafts.listItems).toEqual([]);
    expect(result.current.drafts.parts).toEqual([]);
  });

  it('turns into a document list when a second PDF is added, pinning existing fields to the first', async () => {
    const { result } = renderHook(() => useHarness(baseDraft({ fields: [field('f1')] })));
    let failures: ReadonlyArray<string> = [];
    await act(async () => {
      failures = await result.current.drafts.addFiles([pdf('side-letter.pdf')]);
    });
    expect(failures).toEqual([]);
    const { parts, multi, activePart } = result.current.drafts;
    expect(multi).toBe(true);
    expect(parts.map((p) => [p.title, p.totalPages])).toEqual([
      ['Master agreement', 3],
      ['side-letter', 2],
    ]);
    // The draft mirrors the first part, and the new document is on screen.
    expect(result.current.draft.file).toBe(parts[0]!.file);
    expect(activePart?.id).toBe(parts[1]!.id);
    // The pre-existing field stays on the first document and is hidden while the second shows.
    expect(result.current.draft.fields[0]?.documentId).toBe(parts[0]!.id);
    expect(result.current.drafts.visibleFields).toEqual([]);
    // First part keeps the aspect ratio of the canvas on screen (700 / 560).
    expect(parts[0]!.aspect).toBeCloseTo(1.25);
  });

  it('reports unreadable files and keeps the rest', async () => {
    const { result } = renderHook(() => useHarness(baseDraft()));
    let failures: ReadonlyArray<string> = [];
    await act(async () => {
      failures = await result.current.drafts.addFiles([pdf('bad.pdf'), pdf('good.pdf')]);
    });
    expect(failures).toEqual(['bad.pdf']);
    expect(result.current.drafts.parts.map((p) => p.title)).toEqual(['Master agreement', 'good']);
  });

  it('keeps fields per document: edits land on the document on screen', async () => {
    const { result } = renderHook(() => useHarness(baseDraft()));
    await act(async () => {
      await result.current.drafts.addFiles([pdf('side.pdf')]);
    });
    const [first, second] = result.current.drafts.parts;
    act(() => {
      result.current.drafts.onFieldsChange([field('on-second')]);
    });
    act(() => {
      result.current.drafts.setActiveId(first!.id);
    });
    act(() => {
      result.current.drafts.onFieldsChange([field('on-first')]);
    });
    expect(result.current.drafts.visibleFields.map((f) => f.id)).toEqual(['on-first']);
    expect(result.current.draft.fields.map((f) => [f.id, f.documentId])).toEqual([
      ['on-second', second!.id],
      ['on-first', first!.id],
    ]);
    expect(result.current.drafts.fieldCountById.get(second!.id)).toBe(1);
  });

  it('reorders and mirrors the new first document', async () => {
    const { result } = renderHook(() => useHarness(baseDraft()));
    await act(async () => {
      await result.current.drafts.addFiles([pdf('side.pdf')]);
    });
    const [first, second] = result.current.drafts.parts;
    act(() => {
      result.current.drafts.reorder([second!.id, first!.id]);
    });
    expect(result.current.drafts.parts.map((p) => p.id)).toEqual([second!.id, first!.id]);
    expect(result.current.draft.file).toBe(second!.file);
    expect(result.current.draft.totalPages).toBe(second!.totalPages);
  });

  it('ignores a reorder that does not name every document once', async () => {
    const { result } = renderHook(() => useHarness(baseDraft()));
    await act(async () => {
      await result.current.drafts.addFiles([pdf('side.pdf')]);
    });
    const before = result.current.drafts.parts.map((p) => p.id);
    act(() => {
      result.current.drafts.reorder([before[0]!]);
    });
    expect(result.current.drafts.parts.map((p) => p.id)).toEqual(before);
  });

  it('removes a document with its fields and returns to the single-PDF shape', async () => {
    const { result } = renderHook(() => useHarness(baseDraft()));
    await act(async () => {
      await result.current.drafts.addFiles([pdf('side.pdf')]);
    });
    const [first, second] = result.current.drafts.parts;
    act(() => {
      result.current.drafts.onFieldsChange([field('on-second')]);
    });
    act(() => {
      result.current.drafts.setActiveId(first!.id);
    });
    act(() => {
      result.current.drafts.onFieldsChange([field('on-first')]);
    });
    act(() => {
      result.current.drafts.remove(second!.id);
    });
    expect(result.current.drafts.parts).toEqual([]);
    expect(result.current.drafts.multi).toBe(false);
    expect(result.current.draft.documents).toBeUndefined();
    expect(result.current.draft.file).toBe(first!.file);
    expect(result.current.draft.fields.map((f) => [f.id, f.documentId])).toEqual([
      ['on-first', undefined],
    ]);
  });

  it('never exceeds ten documents', async () => {
    const { result } = renderHook(() => useHarness(baseDraft()));
    const many = Array.from({ length: 12 }, (_, i) => pdf(`extra-${String(i)}.pdf`));
    await act(async () => {
      await result.current.drafts.addFiles(many);
    });
    expect(result.current.drafts.parts).toHaveLength(10);
  });
});
