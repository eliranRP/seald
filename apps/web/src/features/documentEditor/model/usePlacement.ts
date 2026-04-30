import { useCallback } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import type { PlacePagesMode } from '@/components/PlaceOnPagesPopover/PlaceOnPagesPopover.types';
import {
  PASTE_OFFSET,
  SPLIT_TILE_GAP,
  SPLIT_TILE_WIDTH,
  makeGroupId,
  makeId,
  makeLinkId,
  resolveTargetPages,
  withoutGroupId,
} from './lib';
import type { GroupRect } from './useDocumentDerived';

interface UsePlacementArgs {
  readonly fields: ReadonlyArray<PlacedFieldValue>;
  readonly onFieldsChange: (next: ReadonlyArray<PlacedFieldValue>) => void;
  readonly pushUndo: (snapshot: ReadonlyArray<PlacedFieldValue>) => void;
  readonly setSelectedIds: React.Dispatch<React.SetStateAction<ReadonlyArray<string>>>;
  readonly selectedIds: ReadonlyArray<string>;
  readonly groupRect: GroupRect | null;
  readonly totalPages: number;
  readonly signerPopoverFor: string | null;
  readonly pagesPopoverField: PlacedFieldValue | undefined;
  readonly setSignerPopoverFor: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setPagesPopoverFor: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setGroupPagesPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

interface UsePlacementReturn {
  readonly duplicateField: (id: string) => void;
  readonly applySignerSelection: (ids: ReadonlyArray<string>) => void;
  readonly applyPagesSelection: (mode: PlacePagesMode, customPages?: ReadonlyArray<number>) => void;
  readonly applyGroupPagesSelection: (
    mode: PlacePagesMode,
    customPages?: ReadonlyArray<number>,
  ) => void;
}

/**
 * Field placement actions:
 *   - duplicateField: clone a single field at a small offset (for the
 *     FieldsPlacedList row's Duplicate button).
 *   - applySignerSelection: write back the selected signers from the popover.
 *   - applyPagesSelection: clone the source field onto the target pages,
 *     reusing its existing linkId or minting a fresh one so all copies share
 *     a common link.
 *   - applyGroupPagesSelection: same as above but for a multi-field group.
 *     Each source field gets its OWN linkId so a row of N sources becomes N
 *     independent linked columns across the target pages.
 */
export function usePlacement({
  fields,
  onFieldsChange,
  pushUndo,
  setSelectedIds,
  selectedIds,
  groupRect,
  totalPages,
  signerPopoverFor,
  pagesPopoverField,
  setSignerPopoverFor,
  setPagesPopoverFor,
  setGroupPagesPopoverOpen,
}: UsePlacementArgs): UsePlacementReturn {
  const duplicateField = useCallback(
    (id: string): void => {
      const source = fields.find((f) => f.id === id);
      if (!source) return;
      // Clone is standalone: drop `groupId` so a single-field duplicate
      // doesn't silently join the source's persistent group. Users who
      // want grouped clones go through the group-place-on-pages action.
      const clone: PlacedFieldValue = {
        ...withoutGroupId(source),
        id: makeId(),
        x: source.x + PASTE_OFFSET,
        y: source.y + PASTE_OFFSET,
      };
      pushUndo(fields);
      onFieldsChange([...fields, clone]);
      setSelectedIds([clone.id]);
    },
    [fields, onFieldsChange, pushUndo, setSelectedIds],
  );

  const applySignerSelection = useCallback(
    (ids: ReadonlyArray<string>): void => {
      if (!signerPopoverFor) return;
      const source = fields.find((f) => f.id === signerPopoverFor);
      if (!source) {
        setSignerPopoverFor(null);
        return;
      }
      // 0 or 1 signer: single field, just update signerIds.
      if (ids.length <= 1) {
        pushUndo(fields);
        onFieldsChange(
          fields.map((f) => (f.id === signerPopoverFor ? { ...f, signerIds: ids } : f)),
        );
        setSignerPopoverFor(null);
        return;
      }
      // 2+ signers: replace the source with N independent (ungrouped)
      // single-signer fields placed side-by-side starting at the
      // source's coordinates. Default state is ungrouped so the user
      // can move each one individually; the GroupToolbar's "Group"
      // button binds them together when desired (issue #2 v2).
      const cellWidth = source.width ?? SPLIT_TILE_WIDTH;
      const stride = cellWidth + SPLIT_TILE_GAP;
      const splits: ReadonlyArray<PlacedFieldValue> = ids.map((sid, idx) => ({
        ...withoutGroupId(source),
        id: makeId(),
        x: source.x + idx * stride,
        signerIds: [sid],
      }));
      pushUndo(fields);
      onFieldsChange([...fields.filter((f) => f.id !== signerPopoverFor), ...splits]);
      setSelectedIds(splits.map((s) => s.id));
      setSignerPopoverFor(null);
    },
    [fields, onFieldsChange, pushUndo, setSelectedIds, setSignerPopoverFor, signerPopoverFor],
  );

  const applyPagesSelection = useCallback(
    (mode: PlacePagesMode, customPages?: ReadonlyArray<number>): void => {
      const source = pagesPopoverField;
      if (!source) {
        setPagesPopoverFor(null);
        return;
      }
      const targets = resolveTargetPages(mode, source.page, totalPages, customPages);
      if (targets.length === 0) {
        setPagesPopoverFor(null);
        return;
      }
      const linkId = source.linkId ?? makeLinkId();
      const clones: ReadonlyArray<PlacedFieldValue> = targets.map((page) => ({
        id: makeId(),
        page,
        type: source.type,
        x: source.x,
        y: source.y,
        signerIds: source.signerIds,
        linkId,
      }));
      pushUndo(fields);
      onFieldsChange([
        ...fields.map((f) => (f.id === source.id ? { ...f, linkId } : f)),
        ...clones,
      ]);
      setPagesPopoverFor(null);
    },
    [fields, onFieldsChange, pagesPopoverField, pushUndo, setPagesPopoverFor, totalPages],
  );

  const applyGroupPagesSelection = useCallback(
    (mode: PlacePagesMode, customPages?: ReadonlyArray<number>): void => {
      if (selectedIds.length < 2) {
        setGroupPagesPopoverOpen(false);
        return;
      }
      const groupPage = groupRect?.page;
      if (groupPage === undefined) {
        setGroupPagesPopoverOpen(false);
        return;
      }
      const sourceFields = fields.filter((f) => f.page === groupPage && selectedIds.includes(f.id));
      if (sourceFields.length === 0) {
        setGroupPagesPopoverOpen(false);
        return;
      }
      const targets = resolveTargetPages(mode, groupPage, totalPages, customPages);
      if (targets.length === 0) {
        setGroupPagesPopoverOpen(false);
        return;
      }
      // Each source field gets its OWN linkId (reused if present) so after
      // the operation a row of N sources becomes N independent linked
      // columns — one per column across the target pages.
      const linkIdBySource = new Map<string, string>();
      for (const f of sourceFields) {
        linkIdBySource.set(f.id, f.linkId ?? makeLinkId());
      }
      // If the sources are all part of the same persistent group, mint a
      // FRESH groupId per target page so each page's row becomes its
      // own group. Re-using the source groupId across pages would break
      // the single-page invariant that `groupRect` and selection-
      // expansion assume.
      const sourceGroupId = sourceFields[0]?.groupId;
      const sourcesShareGroup =
        sourceGroupId !== undefined && sourceFields.every((f) => f.groupId === sourceGroupId);
      const groupIdByPage = new Map<number, string>();
      if (sourcesShareGroup) {
        for (const page of targets) groupIdByPage.set(page, makeGroupId());
      }
      const clones: ReadonlyArray<PlacedFieldValue> = targets.flatMap((page) =>
        sourceFields.map((f) => {
          const linkId = linkIdBySource.get(f.id);
          const pageGroupId = groupIdByPage.get(page);
          // Strip the source's `groupId` from the spread so clones never
          // leak the source-page group across pages. If sources shared
          // a group, the per-page groupId is added back below.
          return {
            ...withoutGroupId(f),
            id: makeId(),
            page,
            ...(linkId !== undefined ? { linkId } : {}),
            ...(pageGroupId !== undefined ? { groupId: pageGroupId } : {}),
          };
        }),
      );
      pushUndo(fields);
      onFieldsChange([
        ...fields.map((f) => {
          const link = linkIdBySource.get(f.id);
          return link ? { ...f, linkId: link } : f;
        }),
        ...clones,
      ]);
      setGroupPagesPopoverOpen(false);
    },
    [
      fields,
      groupRect,
      onFieldsChange,
      pushUndo,
      selectedIds,
      setGroupPagesPopoverOpen,
      totalPages,
    ],
  );

  return {
    duplicateField,
    applySignerSelection,
    applyPagesSelection,
    applyGroupPagesSelection,
  };
}
