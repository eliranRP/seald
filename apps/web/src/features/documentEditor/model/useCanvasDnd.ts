import { useCallback, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import type { FieldKind } from '@/types/sealdTypes';
import type { DocumentPageSigner } from '@/pages/DocumentPage/DocumentPage.types';
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  MARQUEE_THRESHOLD,
  SPLIT_TILE_GAP,
  SPLIT_TILE_WIDTH,
  expandSelectionToGroup,
  makeId,
} from './lib';

interface MarqueeRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly page: number;
}

interface UseCanvasDndArgs {
  readonly fields: ReadonlyArray<PlacedFieldValue>;
  readonly onFieldsChange: (next: ReadonlyArray<PlacedFieldValue>) => void;
  readonly pushUndo: (snapshot: ReadonlyArray<PlacedFieldValue>) => void;
  readonly signers: ReadonlyArray<DocumentPageSigner>;
  readonly canvasRefsRef: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
  readonly zoom: number;
  readonly setSelectedIds: React.Dispatch<React.SetStateAction<ReadonlyArray<string>>>;
  readonly setSignerPopoverFor: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setPagesPopoverFor: React.Dispatch<React.SetStateAction<string | null>>;
}

interface UseCanvasDndReturn {
  readonly marqueeRect: MarqueeRect | null;
  readonly handlePaletteDragStart: (kind: FieldKind, e: DragEvent<HTMLElement>) => void;
  readonly handlePaletteDragEnd: () => void;
  readonly handleCanvasDragOver: (e: DragEvent<HTMLDivElement>) => void;
  readonly handleCanvasDrop: (e: DragEvent<HTMLDivElement>, dropPage: number) => void;
  readonly handleCanvasBackgroundClick: () => void;
  readonly handleCanvasMouseDown: (e: ReactMouseEvent<HTMLDivElement>, page: number) => void;
}

/**
 * Drag-from-palette + drop-onto-canvas + lasso-marquee selection. Owns:
 *   - `dragKindRef` — the field kind currently being dragged from the palette
 *   - `marqueeRect` — live rectangle while the user lassos empty canvas
 *   - `suppressNextBgClickRef` — prevents the synthetic click after a marquee
 *     drag from clearing the freshly-selected group
 *
 * Drop coords are divided by `zoom` so they land in the canvas's native
 * coordinate space regardless of the visual scale.
 */
export function useCanvasDnd({
  fields,
  onFieldsChange,
  pushUndo,
  signers,
  canvasRefsRef,
  zoom,
  setSelectedIds,
  setSignerPopoverFor,
  setPagesPopoverFor,
}: UseCanvasDndArgs): UseCanvasDndReturn {
  const dragKindRef = useRef<FieldKind | null>(null);
  const suppressNextBgClickRef = useRef<boolean>(false);
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  const handlePaletteDragStart = useCallback((kind: FieldKind, e: DragEvent<HTMLElement>): void => {
    dragKindRef.current = kind;
    try {
      e.dataTransfer.setData('text/plain', kind);
      e.dataTransfer.effectAllowed = 'copy';
    } catch {
      // Some browsers disallow dataTransfer mutation in tests — the ref is
      // the authoritative source.
    }
  }, []);

  const handlePaletteDragEnd = useCallback((): void => {
    dragKindRef.current = null;
  }, []);

  const handleCanvasDragOver = useCallback((e: DragEvent<HTMLDivElement>): void => {
    if (!dragKindRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleCanvasDrop = useCallback(
    (e: DragEvent<HTMLDivElement>, dropPage: number): void => {
      const kind = dragKindRef.current;
      if (!kind) return;
      e.preventDefault();
      const rect = canvasRefsRef.current.get(dropPage)?.getBoundingClientRect();
      const localX = (e.clientX - (rect?.left ?? 0)) / zoom;
      const localY = (e.clientY - (rect?.top ?? 0)) / zoom;
      const x = Math.max(0, Math.round(localX - FIELD_WIDTH / 2));
      const y = Math.max(0, Math.round(localY - FIELD_HEIGHT / 2));

      // Pre-populate signers with everyone so the common case ("everyone
      // signs this") is a single confirmation click. When more than one
      // signer is on the document, we split the drop into N independent
      // (ungrouped) fields placed side-by-side rather than one multi-
      // signer tile — that's what makes it possible to position each
      // signer's box individually without first ungrouping (issue #2 v2).
      const signerIds = signers.map((s) => s.id);
      pushUndo(fields);
      if (signerIds.length <= 1) {
        const dropped: PlacedFieldValue = {
          id: makeId(),
          page: dropPage,
          type: kind,
          x,
          y,
          signerIds,
        };
        onFieldsChange([...fields, dropped]);
        setSelectedIds([dropped.id]);
        setSignerPopoverFor(dropped.id);
      } else {
        const stride = SPLIT_TILE_WIDTH + SPLIT_TILE_GAP;
        const dropped: ReadonlyArray<PlacedFieldValue> = signerIds.map((sid, idx) => ({
          id: makeId(),
          page: dropPage,
          type: kind,
          x: x + idx * stride,
          y,
          signerIds: [sid],
        }));
        onFieldsChange([...fields, ...dropped]);
        setSelectedIds(dropped.map((d) => d.id));
        // No popover — the user already has every signer represented
        // by the N fields they can adjust individually.
      }
      dragKindRef.current = null;
    },
    [
      canvasRefsRef,
      fields,
      onFieldsChange,
      pushUndo,
      setSelectedIds,
      setSignerPopoverFor,
      signers,
      zoom,
    ],
  );

  const handleCanvasBackgroundClick = useCallback((): void => {
    if (suppressNextBgClickRef.current) {
      suppressNextBgClickRef.current = false;
      return;
    }
    setSelectedIds([]);
  }, [setSelectedIds]);

  const handleCanvasMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>, page: number): void => {
      if (e.button !== 0) return;
      const canvas = canvasRefsRef.current.get(page);
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const startX = (e.clientX - rect.left) / zoom;
      const startY = (e.clientY - rect.top) / zoom;
      let moved = false;
      let curX = startX;
      let curY = startY;

      const onMove = (ev: MouseEvent): void => {
        curX = (ev.clientX - rect.left) / zoom;
        curY = (ev.clientY - rect.top) / zoom;
        if (!moved && Math.hypot(curX - startX, curY - startY) < MARQUEE_THRESHOLD) return;
        moved = true;
        setMarqueeRect({
          x: Math.min(startX, curX),
          y: Math.min(startY, curY),
          w: Math.abs(curX - startX),
          h: Math.abs(curY - startY),
          page,
        });
      };

      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setMarqueeRect(null);
        if (!moved) return;
        const r = {
          x: Math.min(startX, curX),
          y: Math.min(startY, curY),
          w: Math.abs(curX - startX),
          h: Math.abs(curY - startY),
        };
        const hit = fields
          .filter((f) => f.page === page)
          .filter((f) => {
            const fw = f.width ?? FIELD_WIDTH;
            const fh = f.height ?? FIELD_HEIGHT;
            return f.x < r.x + r.w && f.x + fw > r.x && f.y < r.y + r.h && f.y + fh > r.y;
          });
        // Persistent groups (set via the GroupToolbar's "Group" button)
        // expand the marquee selection so partial captures still pick
        // up every group member — that's what makes drag/duplicate
        // operate on the whole group.
        const expanded = expandSelectionToGroup(
          hit.map((f) => f.id),
          fields,
        );
        setSelectedIds(expanded);
        setSignerPopoverFor(null);
        setPagesPopoverFor(null);
        suppressNextBgClickRef.current = true;
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [canvasRefsRef, fields, setPagesPopoverFor, setSelectedIds, setSignerPopoverFor, zoom],
  );

  return {
    marqueeRect,
    handlePaletteDragStart,
    handlePaletteDragEnd,
    handleCanvasDragOver,
    handleCanvasDrop,
    handleCanvasBackgroundClick,
    handleCanvasMouseDown,
  };
}
