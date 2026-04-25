import { useCallback, useMemo, useState } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import type { RemoveLinkedScope } from '@/components/RemoveLinkedCopiesDialog';

interface UseLinkedRemoveArgs {
  readonly fields: ReadonlyArray<PlacedFieldValue>;
  readonly onFieldsChange: (next: ReadonlyArray<PlacedFieldValue>) => void;
  readonly pushUndo: (snapshot: ReadonlyArray<PlacedFieldValue>) => void;
  readonly setSelectedIds: React.Dispatch<React.SetStateAction<ReadonlyArray<string>>>;
  readonly clearSignerPopover: () => void;
  readonly clearPagesPopover: () => void;
}

interface PendingRemove {
  readonly ids: ReadonlyArray<string>;
}

interface UseLinkedRemoveReturn {
  readonly pendingRemove: PendingRemove | null;
  readonly pendingLinkedCount: number;
  readonly removeByIds: (ids: ReadonlyArray<string>) => void;
  readonly requestRemove: (ids: ReadonlyArray<string>) => void;
  readonly handleRemoveLinkedConfirm: (scope: RemoveLinkedScope) => void;
  readonly handleRemoveLinkedCancel: () => void;
}

/**
 * Remove flow with linked-copy awareness. If any target field belongs to a
 * linked group whose peers live on other pages, we open the confirmation
 * dialog so the user can choose between "only this page" and "all pages".
 * Otherwise we remove immediately.
 *
 * The confirm callback re-derives the link set from the *current* `fields`
 * snapshot rather than capturing it at click time so late edits can't leave
 * the dialog operating on stale data.
 */
export function useLinkedRemove({
  fields,
  onFieldsChange,
  pushUndo,
  setSelectedIds,
  clearSignerPopover,
  clearPagesPopover,
}: UseLinkedRemoveArgs): UseLinkedRemoveReturn {
  const [pendingRemove, setPendingRemove] = useState<PendingRemove | null>(null);

  const removeByIds = useCallback(
    (ids: ReadonlyArray<string>): void => {
      if (ids.length === 0) return;
      pushUndo(fields);
      onFieldsChange(fields.filter((f) => !ids.includes(f.id)));
      setSelectedIds((prev) => prev.filter((sid) => !ids.includes(sid)));
      clearSignerPopover();
      clearPagesPopover();
    },
    [clearPagesPopover, clearSignerPopover, fields, onFieldsChange, pushUndo, setSelectedIds],
  );

  const requestRemove = useCallback(
    (ids: ReadonlyArray<string>): void => {
      if (ids.length === 0) return;
      const linkIds = new Set<string>();
      for (const f of fields) {
        if (ids.includes(f.id) && f.linkId) linkIds.add(f.linkId);
      }
      const hasLinkedElsewhere =
        linkIds.size > 0 &&
        fields.some((f) => f.linkId != null && linkIds.has(f.linkId) && !ids.includes(f.id));
      if (!hasLinkedElsewhere) {
        removeByIds(ids);
        return;
      }
      setPendingRemove({ ids });
    },
    [fields, removeByIds],
  );

  const pendingLinkedCount = useMemo<number>(() => {
    if (!pendingRemove) return 0;
    const linkIds = new Set<string>();
    for (const f of fields) {
      if (pendingRemove.ids.includes(f.id) && f.linkId) linkIds.add(f.linkId);
    }
    if (linkIds.size === 0) return pendingRemove.ids.length;
    return fields.filter(
      (f) => pendingRemove.ids.includes(f.id) || (f.linkId != null && linkIds.has(f.linkId)),
    ).length;
  }, [fields, pendingRemove]);

  const handleRemoveLinkedConfirm = useCallback(
    (scope: RemoveLinkedScope): void => {
      const pending = pendingRemove;
      if (!pending) return;
      if (scope === 'only-this') {
        removeByIds(pending.ids);
      } else {
        const linkIds = new Set<string>();
        for (const f of fields) {
          if (pending.ids.includes(f.id) && f.linkId) linkIds.add(f.linkId);
        }
        const idsToRemove = fields
          .filter((f) => pending.ids.includes(f.id) || (f.linkId != null && linkIds.has(f.linkId)))
          .map((f) => f.id);
        removeByIds(idsToRemove);
      }
      setPendingRemove(null);
    },
    [fields, pendingRemove, removeByIds],
  );

  const handleRemoveLinkedCancel = useCallback((): void => {
    setPendingRemove(null);
  }, []);

  return {
    pendingRemove,
    pendingLinkedCount,
    removeByIds,
    requestRemove,
    handleRemoveLinkedConfirm,
    handleRemoveLinkedCancel,
  };
}
