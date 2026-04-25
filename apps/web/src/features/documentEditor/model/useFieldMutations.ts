import { useCallback, useState } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { FIELD_HEIGHT, FIELD_WIDTH, SNAP_THRESHOLD } from './lib';

interface SnapGuide {
  readonly orientation: 'h' | 'v';
  readonly pos: number;
  readonly page: number;
}

interface UseFieldMutationsArgs {
  readonly fields: ReadonlyArray<PlacedFieldValue>;
  readonly onFieldsChange: (next: ReadonlyArray<PlacedFieldValue>) => void;
  readonly selectedIds: ReadonlyArray<string>;
}

interface UseFieldMutationsReturn {
  readonly snapGuides: ReadonlyArray<SnapGuide>;
  readonly clearSnapGuides: () => void;
  readonly moveField: (id: string, x: number, y: number) => void;
  readonly resizeField: (id: string, x: number, y: number, width: number, height: number) => void;
  readonly toggleRequired: (id: string, next: boolean) => void;
}

/**
 * Move + resize + toggle-required mutations for placed fields, plus the
 * snap-guide state that surfaces while dragging within {@link SNAP_THRESHOLD}
 * of another field's edge or center on the same page.
 *
 * Move respects multi-selection: dragging a member of a group translates
 * every selected field by the same delta. Snap math runs against same-page
 * peers that aren't currently moving so the dragged group doesn't snap to
 * itself.
 */
export function useFieldMutations({
  fields,
  onFieldsChange,
  selectedIds,
}: UseFieldMutationsArgs): UseFieldMutationsReturn {
  const [snapGuides, setSnapGuides] = useState<ReadonlyArray<SnapGuide>>([]);
  const clearSnapGuides = useCallback(() => setSnapGuides([]), []);

  const moveField = useCallback(
    (id: string, x: number, y: number): void => {
      const anchor = fields.find((f) => f.id === id);
      if (!anchor) return;
      const w = anchor.width ?? FIELD_WIDTH;
      const h = anchor.height ?? FIELD_HEIGHT;
      const grouped = selectedIds.includes(id) && selectedIds.length > 1;
      const movingSet = grouped ? new Set(selectedIds) : new Set<string>([id]);
      const peers = fields.filter((f) => f.page === anchor.page && !movingSet.has(f.id));

      // --- Horizontal snapping (vertical guide lines) ---
      let snappedX = x;
      const vGuides: SnapGuide[] = [];
      for (const p of peers) {
        const pw = p.width ?? FIELD_WIDTH;
        if (Math.abs(x - p.x) <= SNAP_THRESHOLD) {
          snappedX = p.x;
          vGuides.push({ orientation: 'v', pos: p.x, page: anchor.page });
          break;
        }
        if (Math.abs(x + w - (p.x + pw)) <= SNAP_THRESHOLD) {
          snappedX = p.x + pw - w;
          vGuides.push({ orientation: 'v', pos: p.x + pw, page: anchor.page });
          break;
        }
        if (Math.abs(x + w / 2 - (p.x + pw / 2)) <= SNAP_THRESHOLD) {
          snappedX = p.x + pw / 2 - w / 2;
          vGuides.push({ orientation: 'v', pos: p.x + pw / 2, page: anchor.page });
          break;
        }
      }

      // --- Vertical snapping (horizontal guide lines) ---
      let snappedY = y;
      const hGuides: SnapGuide[] = [];
      for (const p of peers) {
        const ph = p.height ?? FIELD_HEIGHT;
        if (Math.abs(y - p.y) <= SNAP_THRESHOLD) {
          snappedY = p.y;
          hGuides.push({ orientation: 'h', pos: p.y, page: anchor.page });
          break;
        }
        if (Math.abs(y + h - (p.y + ph)) <= SNAP_THRESHOLD) {
          snappedY = p.y + ph - h;
          hGuides.push({ orientation: 'h', pos: p.y + ph, page: anchor.page });
          break;
        }
        if (Math.abs(y + h / 2 - (p.y + ph / 2)) <= SNAP_THRESHOLD) {
          snappedY = p.y + ph / 2 - h / 2;
          hGuides.push({ orientation: 'h', pos: p.y + ph / 2, page: anchor.page });
          break;
        }
      }

      setSnapGuides([...vGuides, ...hGuides]);

      const dx = snappedX - anchor.x;
      const dy = snappedY - anchor.y;
      if (grouped) {
        onFieldsChange(
          fields.map((f) => (selectedIds.includes(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f)),
        );
      } else {
        onFieldsChange(fields.map((f) => (f.id === id ? { ...f, x: snappedX, y: snappedY } : f)));
      }
    },
    [fields, onFieldsChange, selectedIds],
  );

  const resizeField = useCallback(
    (id: string, x: number, y: number, width: number, height: number): void => {
      onFieldsChange(fields.map((f) => (f.id === id ? { ...f, x, y, width, height } : f)));
    },
    [fields, onFieldsChange],
  );

  const toggleRequired = useCallback(
    (id: string, next: boolean): void => {
      onFieldsChange(fields.map((f) => (f.id === id ? { ...f, required: next } : f)));
    },
    [fields, onFieldsChange],
  );

  return { snapGuides, clearSnapGuides, moveField, resizeField, toggleRequired };
}
