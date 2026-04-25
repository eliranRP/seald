import { useMemo } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import type { FieldKind } from '@/types/sealdTypes';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import type { DocumentPageSigner } from '@/pages/DocumentPage/DocumentPage.types';
import { FIELD_HEIGHT, FIELD_WIDTH } from './lib';

interface PlacedSigner {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

interface PanelSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

interface FieldSummary {
  readonly id: string;
  readonly type: FieldKind;
  readonly page: number;
  readonly signerIds: ReadonlyArray<string>;
}

export interface GroupRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly page: number;
}

interface UseDocumentDerivedArgs {
  readonly fields: ReadonlyArray<PlacedFieldValue>;
  readonly signers: ReadonlyArray<DocumentPageSigner>;
  readonly contacts: ReadonlyArray<AddSignerContact>;
  readonly selectedIds: ReadonlyArray<string>;
  readonly signerPopoverFor: string | null;
  readonly pagesPopoverFor: string | null;
}

interface UseDocumentDerivedReturn {
  readonly placedFieldSigners: ReadonlyArray<PlacedSigner>;
  readonly panelSigners: ReadonlyArray<PanelSigner>;
  readonly popoverSigners: ReadonlyArray<PlacedSigner>;
  readonly fieldsSummary: ReadonlyArray<FieldSummary>;
  readonly fieldCountByPage: Readonly<Record<number, number>>;
  readonly usageByKind: Readonly<Partial<Record<FieldKind, number>>>;
  readonly existingContactIds: ReadonlyArray<string>;
  readonly singleSelectedId: string | null;
  readonly groupRect: GroupRect | null;
  readonly signerPopoverField: PlacedFieldValue | undefined;
  readonly pagesPopoverField: PlacedFieldValue | undefined;
}

/**
 * Memoized derivations the page passes to its children. Kept here so the
 * page itself stays declarative — a single hook returns every shape the
 * downstream UI needs.
 *
 * Each memo runs in a single pass over `fields` (rule 2.6).
 */
export function useDocumentDerived({
  fields,
  signers,
  contacts,
  selectedIds,
  signerPopoverFor,
  pagesPopoverFor,
}: UseDocumentDerivedArgs): UseDocumentDerivedReturn {
  const placedFieldSigners = useMemo(
    () => signers.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    [signers],
  );
  const panelSigners = useMemo(
    () => signers.map((s) => ({ id: s.id, name: s.name, email: s.email, color: s.color })),
    [signers],
  );
  const popoverSigners = useMemo(
    () => signers.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    [signers],
  );
  const fieldsSummary = useMemo<ReadonlyArray<FieldSummary>>(
    () =>
      fields.map((f) => ({
        id: f.id,
        type: f.type,
        page: f.page,
        signerIds: f.signerIds,
      })),
    [fields],
  );

  // Single pass — both per-page and per-kind tallies share the iteration.
  const { fieldCountByPage, usageByKind } = useMemo(() => {
    const byPage: Record<number, number> = {};
    const byKind: Partial<Record<FieldKind, number>> = {};
    for (const f of fields) {
      byPage[f.page] = (byPage[f.page] ?? 0) + 1;
      byKind[f.type] = (byKind[f.type] ?? 0) + 1;
    }
    return { fieldCountByPage: byPage, usageByKind: byKind };
  }, [fields]);

  const existingContactIds = useMemo(
    () => signers.map((s) => s.id).filter((id) => contacts.some((c) => c.id === id)),
    [signers, contacts],
  );

  const singleSelectedId = useMemo<string | null>(
    () => (selectedIds.length === 1 ? (selectedIds[0] ?? null) : null),
    [selectedIds],
  );

  // Axis-aligned bounding box of the multi-field selection. The group lives
  // on whichever page the FIRST selected field is on — derived from the
  // fields, not `currentPage` (which tracks viewport scroll, not selection).
  const groupRect = useMemo<GroupRect | null>(() => {
    if (selectedIds.length < 2) return null;
    const firstSelected = fields.find((f) => selectedIds.includes(f.id));
    if (!firstSelected) return null;
    const groupPage = firstSelected.page;
    const picked = fields.filter((f) => f.page === groupPage && selectedIds.includes(f.id));
    if (picked.length < 2) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const f of picked) {
      const fw = f.width ?? FIELD_WIDTH;
      const fh = f.height ?? FIELD_HEIGHT;
      if (f.x < minX) minX = f.x;
      if (f.y < minY) minY = f.y;
      if (f.x + fw > maxX) maxX = f.x + fw;
      if (f.y + fh > maxY) maxY = f.y + fh;
    }
    // Guard against non-finite coords (synthetic drops in tests where
    // clientX/Y are absent). Rendering Infinity into CSS `left` triggers a
    // React warning, so skip the toolbar in that case.
    if (
      !Number.isFinite(minX) ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxX) ||
      !Number.isFinite(maxY)
    ) {
      return null;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, page: groupPage };
  }, [fields, selectedIds]);

  const signerPopoverField = useMemo(
    () => (signerPopoverFor ? fields.find((f) => f.id === signerPopoverFor) : undefined),
    [signerPopoverFor, fields],
  );
  const pagesPopoverField = useMemo(
    () => (pagesPopoverFor ? fields.find((f) => f.id === pagesPopoverFor) : undefined),
    [pagesPopoverFor, fields],
  );

  return {
    placedFieldSigners,
    panelSigners,
    popoverSigners,
    fieldsSummary,
    fieldCountByPage,
    usageByKind,
    existingContactIds,
    singleSelectedId,
    groupRect,
    signerPopoverField,
    pagesPopoverField,
  };
}
