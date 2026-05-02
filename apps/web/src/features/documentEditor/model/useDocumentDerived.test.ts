import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import type { DocumentPageSigner } from '@/pages/DocumentPage/DocumentPage.types';
import { useDocumentDerived } from './useDocumentDerived';

const f = (overrides: Partial<PlacedFieldValue> & { readonly id: string }): PlacedFieldValue => ({
  page: 1,
  type: 'signature',
  x: 0,
  y: 0,
  signerIds: ['a'],
  ...overrides,
});

const signer = (id: string, color = '#10B981'): DocumentPageSigner => ({
  id,
  name: id,
  email: `${id}@seald.app`,
  color,
});

const contact = (id: string): AddSignerContact => ({
  id,
  name: id,
  email: `${id}@seald.app`,
  color: '#818CF8',
});

describe('useDocumentDerived', () => {
  it('projects signer arrays into the three lightweight shapes the UI consumes', () => {
    const signers = [signer('alice'), signer('bob', '#F59E0B')];
    const { result } = renderHook(() =>
      useDocumentDerived({
        fields: [],
        signers,
        contacts: [],
        selectedIds: [],
        signerPopoverFor: null,
        pagesPopoverFor: null,
      }),
    );
    expect(result.current.placedFieldSigners).toEqual([
      { id: 'alice', name: 'alice', color: '#10B981' },
      { id: 'bob', name: 'bob', color: '#F59E0B' },
    ]);
    expect(result.current.panelSigners[0]!.email).toBe('alice@seald.app');
    expect(result.current.popoverSigners[1]!.color).toBe('#F59E0B');
  });

  it('builds fieldsSummary with id/type/page/signerIds (omits coords)', () => {
    const fields = [f({ id: '1', page: 2, type: 'date', signerIds: ['a', 'b'] })];
    const { result } = renderHook(() =>
      useDocumentDerived({
        fields,
        signers: [],
        contacts: [],
        selectedIds: [],
        signerPopoverFor: null,
        pagesPopoverFor: null,
      }),
    );
    expect(result.current.fieldsSummary).toEqual([
      { id: '1', type: 'date', page: 2, signerIds: ['a', 'b'] },
    ]);
  });

  it('tallies fieldCountByPage and usageByKind in a single pass', () => {
    const fields = [
      f({ id: '1', page: 1, type: 'signature' }),
      f({ id: '2', page: 1, type: 'signature' }),
      f({ id: '3', page: 2, type: 'date' }),
    ];
    const { result } = renderHook(() =>
      useDocumentDerived({
        fields,
        signers: [],
        contacts: [],
        selectedIds: [],
        signerPopoverFor: null,
        pagesPopoverFor: null,
      }),
    );
    expect(result.current.fieldCountByPage).toEqual({ 1: 2, 2: 1 });
    expect(result.current.usageByKind).toEqual({ signature: 2, date: 1 });
  });

  it('reports existingContactIds for signers that match a saved contact', () => {
    const signers = [signer('alice'), signer('bob')];
    const { result } = renderHook(() =>
      useDocumentDerived({
        fields: [],
        signers,
        contacts: [contact('alice')],
        selectedIds: [],
        signerPopoverFor: null,
        pagesPopoverFor: null,
      }),
    );
    expect(result.current.existingContactIds).toEqual(['alice']);
  });

  it('exposes singleSelectedId only when exactly one field is selected', () => {
    const { result, rerender } = renderHook(
      ({ selectedIds }: { selectedIds: ReadonlyArray<string> }) =>
        useDocumentDerived({
          fields: [f({ id: 'a' }), f({ id: 'b' })],
          signers: [],
          contacts: [],
          selectedIds,
          signerPopoverFor: null,
          pagesPopoverFor: null,
        }),
      { initialProps: { selectedIds: ['a'] as ReadonlyArray<string> } },
    );
    expect(result.current.singleSelectedId).toBe('a');
    rerender({ selectedIds: [] });
    expect(result.current.singleSelectedId).toBeNull();
    rerender({ selectedIds: ['a', 'b'] });
    expect(result.current.singleSelectedId).toBeNull();
  });

  it('returns null groupRect for fewer than 2 selected fields', () => {
    const { result } = renderHook(() =>
      useDocumentDerived({
        fields: [f({ id: 'a' })],
        signers: [],
        contacts: [],
        selectedIds: ['a'],
        signerPopoverFor: null,
        pagesPopoverFor: null,
      }),
    );
    expect(result.current.groupRect).toBeNull();
  });

  it('computes axis-aligned groupRect from same-page selected fields', () => {
    const fields = [
      f({ id: 'a', page: 1, x: 10, y: 10, width: 100, height: 50 }),
      f({ id: 'b', page: 1, x: 200, y: 80, width: 60, height: 40 }),
      // Same page but unselected — must NOT influence the rect.
      f({ id: 'c', page: 1, x: 1000, y: 1000 }),
    ];
    const { result } = renderHook(() =>
      useDocumentDerived({
        fields,
        signers: [],
        contacts: [],
        selectedIds: ['a', 'b'],
        signerPopoverFor: null,
        pagesPopoverFor: null,
      }),
    );
    expect(result.current.groupRect).toEqual({
      x: 10,
      y: 10,
      w: 200 + 60 - 10, // 250
      h: 80 + 40 - 10, // 110
      page: 1,
    });
  });

  it('returns null groupRect when only one selected field actually lives on the group page', () => {
    const fields = [f({ id: 'a', page: 1 }), f({ id: 'b', page: 2 })];
    const { result } = renderHook(() =>
      useDocumentDerived({
        fields,
        signers: [],
        contacts: [],
        selectedIds: ['a', 'b'],
        signerPopoverFor: null,
        pagesPopoverFor: null,
      }),
    );
    expect(result.current.groupRect).toBeNull();
  });

  it('signerPopoverField / pagesPopoverField resolve from the matching id, undefined otherwise', () => {
    const fields = [f({ id: '1' })];
    const { result, rerender } = renderHook(
      ({
        signerPopoverFor,
        pagesPopoverFor,
      }: {
        signerPopoverFor: string | null;
        pagesPopoverFor: string | null;
      }) =>
        useDocumentDerived({
          fields,
          signers: [],
          contacts: [],
          selectedIds: [],
          signerPopoverFor,
          pagesPopoverFor,
        }),
      {
        initialProps: {
          signerPopoverFor: '1' as string | null,
          pagesPopoverFor: 'gone' as string | null,
        },
      },
    );
    expect(result.current.signerPopoverField?.id).toBe('1');
    expect(result.current.pagesPopoverField).toBeUndefined();
    rerender({ signerPopoverFor: null, pagesPopoverFor: '1' });
    expect(result.current.signerPopoverField).toBeUndefined();
    expect(result.current.pagesPopoverField?.id).toBe('1');
  });
});
