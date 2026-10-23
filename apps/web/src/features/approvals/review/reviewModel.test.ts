import { describe, expect, it } from 'vitest';
import { fakeEnvelope, fakeSingleDocumentEnvelope } from '../fixtures';
import {
  buildReviewPages,
  fieldBox,
  fieldCountByPage,
  fieldsOnPage,
  initialsOf,
  pagesLabel,
  summarizeSigners,
} from './reviewModel';

describe('buildReviewPages', () => {
  it('lists every page of every document in order', () => {
    const pages = buildReviewPages(fakeEnvelope());
    expect(pages.map((p) => [p.index, p.documentId, p.page])).toEqual([
      [1, 'd1', 1],
      [2, 'd1', 2],
      [3, 'd2', 1],
    ]);
    expect(pages.every((p) => p.multiDocument)).toBe(true);
  });

  it('uses the envelope for a single document with no document list', () => {
    const pages = buildReviewPages(
      fakeSingleDocumentEnvelope({
        original_pages: 2,
        fields: [
          { id: 'f', signer_id: 's1', kind: 'text', page: 3, x: 0.1, y: 0.1, required: true },
        ],
      }),
    );
    expect(pages).toHaveLength(3);
    expect(pages[0]?.documentTitle).toBe('Services agreement');
    expect(pages[0]?.multiDocument).toBe(false);
  });

  it('shows at least one page', () => {
    expect(
      buildReviewPages(fakeSingleDocumentEnvelope({ original_pages: null, fields: [] })),
    ).toHaveLength(1);
  });
});

describe('fields and signers', () => {
  const envelope = fakeEnvelope();
  const pages = buildReviewPages(envelope);

  it('puts a field only on its own document and page', () => {
    expect(fieldsOnPage(envelope, pages[0]!).map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(fieldsOnPage(envelope, pages[2]!).map((f) => f.id)).toEqual(['f4']);
  });

  it('counts fields per page for the thumbnail rail', () => {
    expect(fieldCountByPage(envelope, pages)).toEqual({ 1: 2, 2: 1, 3: 1 });
  });

  it('summarises each signer with a count and the pages they are on', () => {
    const summary = summarizeSigners(envelope, pages);
    expect(summary.map((s) => [s.name, s.fieldCount, s.pages])).toEqual([
      ['Ada Lovelace', 2, [1, 2]],
      ['Grace Hopper', 2, [1, 3]],
    ]);
  });

  it('words the pages', () => {
    expect(pagesLabel([])).toBe('no pages');
    expect(pagesLabel([2])).toBe('page 2');
    expect(pagesLabel([1, 3])).toBe('pages 1, 3');
  });

  it('makes initials', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL');
    expect(initialsOf('Plato')).toBe('P');
    expect(initialsOf('  ')).toBe('?');
  });
});

describe('fieldBox', () => {
  it('turns fractions into percentages', () => {
    const box = fieldBox({
      id: 'f',
      signer_id: 's',
      kind: 'signature',
      page: 1,
      x: 0.1,
      y: 0.5,
      width: 0.3,
      height: 0.1,
      required: true,
    });
    expect(box.left).toBeCloseTo(10);
    expect(box.top).toBeCloseTo(50);
    expect(box.width).toBeCloseTo(30);
    expect(box.height).toBeCloseTo(10);
  });

  it('reads a value above 1 as a legacy pixel position on the 560 px canvas', () => {
    const box = fieldBox({
      id: 'f',
      signer_id: 's',
      kind: 'signature',
      page: 1,
      x: 280,
      y: 370,
      required: true,
    });
    expect(box.left).toBeCloseTo(50);
    expect(box.top).toBeCloseTo(50);
  });

  it('falls back to a default size', () => {
    const box = fieldBox({
      id: 'f',
      signer_id: 's',
      kind: 'initials',
      page: 1,
      x: 0.1,
      y: 0.1,
      required: true,
    });
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
});
