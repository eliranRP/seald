import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { ArrowLeft, Copy, X as XIcon } from 'lucide-react';
import { AddSignerDropdown } from '../../components/AddSignerDropdown';
import type { AddSignerContact } from '../../components/AddSignerDropdown/AddSignerDropdown.types';
import { Button } from '../../components/Button';
import { CollapsibleRail } from '../../components/CollapsibleRail';
import { DocumentCanvas } from '../../components/DocumentCanvas';
import { FieldPalette } from '../../components/FieldPalette';
import { FieldsPlacedList } from '../../components/FieldsPlacedList';
import { NavBar } from '../../components/NavBar';
import { PageThumbStrip } from '../../components/PageThumbStrip';
import { PageToolbar } from '../../components/PageToolbar';
import { PlaceOnPagesPopover } from '../../components/PlaceOnPagesPopover';
import type { PlacePagesMode } from '../../components/PlaceOnPagesPopover/PlaceOnPagesPopover.types';
import { PlacedField } from '../../components/PlacedField';
import type { PlacedFieldValue } from '../../components/PlacedField/PlacedField.types';
import { SelectSignersPopover } from '../../components/SelectSignersPopover';
import { SendPanelFooter } from '../../components/SendPanelFooter';
import { SideBar } from '../../components/SideBar';
import { SignersPanel } from '../../components/SignersPanel';
import type { FieldKind } from '../../types/sealdTypes';
import type { DocumentPageProps } from './DocumentPage.types';
import {
  Body,
  CanvasWrap,
  Center,
  CenterHeader,
  CenterHeaderSide,
  GroupBoundary,
  GroupToolbar,
  GroupToolbarButton,
  GroupToolbarLabel,
  MarqueeRect,
  RightRailFooter,
  RightRailInner,
  RightRailScroll,
  Shell,
  SnapGuide,
  Workspace,
} from './DocumentPage.styles';

const DEFAULT_LEFT_WIDTH = 240;
const DEFAULT_RIGHT_WIDTH = 320;
const FIELD_WIDTH = 132;
const FIELD_HEIGHT = 54;
// Horizontal gap between adjacent drop-split siblings so each signer's field
// sits cleanly next to the others rather than stacking on top of them.
const DROP_SIBLING_GAP = 12;
// Pixels the pointer must travel before a mousedown on the canvas background
// is treated as a marquee-select drag rather than a plain click.
const MARQUEE_THRESHOLD = 3;
// Pointer tolerance (px) for aligning a dragged field's edge/center with
// another field's edge/center. Small enough not to catch "accidental" snaps
// while still feeling magnetic when the user approaches alignment.
const SNAP_THRESHOLD = 5;
// Pixel offset applied to pasted / keyboard-duplicated fields so they're not
// perfectly hidden behind the original.
const PASTE_OFFSET = 16;
// Cap on the number of undo snapshots we retain — enough for several reverses
// while keeping memory bounded on long sessions.
const UNDO_HISTORY_LIMIT = 50;
const ADDDROPDOWN_WRAP_STYLE: React.CSSProperties = {
  position: 'relative',
  height: 0,
};

function makeId(): string {
  // RFC-style compact id — good enough for DOM keys and internal refs.
  return `f_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

/**
 * Resolve the target pages for a duplicate-to-pages action. Skips the source
 * page so the caller can append new field clones without producing a duplicate
 * on the originating page.
 */
function resolveTargetPages(
  mode: PlacePagesMode,
  sourcePage: number,
  totalPages: number,
  customPages?: ReadonlyArray<number>,
): ReadonlyArray<number> {
  const all = Array.from({ length: totalPages }, (_v, i) => i + 1);
  switch (mode) {
    case 'this':
      return [];
    case 'all':
      return all.filter((p) => p !== sourcePage);
    case 'allButLast':
      return all.filter((p) => p !== sourcePage && p !== totalPages);
    case 'last':
      return totalPages === sourcePage ? [] : [totalPages];
    case 'custom':
      return (customPages ?? []).filter((p) => p !== sourcePage && p >= 1 && p <= totalPages);
    default:
      return [];
  }
}

export const DocumentPage = forwardRef<HTMLDivElement, DocumentPageProps>((props, ref) => {
  const {
    totalPages,
    title,
    docId,
    initialPage = 1,
    fields,
    onFieldsChange,
    availableFieldKinds,
    requiredFieldKinds,
    signers,
    contacts = [],
    onAddSignerFromContact,
    onCreateSigner,
    onRemoveSigner,
    onSend,
    onSaveDraft,
    onBack,
    user,
    onLogoClick,
    onSelectNavItem,
    activeNavId = 'documents',
    ...rest
  } = props;

  const [currentPage, setCurrentPage] = useState<number>(() =>
    Math.min(Math.max(initialPage, 1), totalPages),
  );
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH);
  const [rightWidth, setRightWidth] = useState(DEFAULT_RIGHT_WIDTH);
  const [selectedIds, setSelectedIds] = useState<ReadonlyArray<string>>([]);
  const [signerPopoverFor, setSignerPopoverFor] = useState<string | null>(null);
  const [pagesPopoverFor, setPagesPopoverFor] = useState<string | null>(null);
  // Mirrors `pagesPopoverFor` but for a multi-field (group) selection — the
  // popover clones every selected field onto the chosen target pages instead
  // of a single source field.
  const [groupPagesPopoverOpen, setGroupPagesPopoverOpen] = useState(false);
  const [addSignerOpen, setAddSignerOpen] = useState(false);
  // --------------------------------------------------------------- marquee
  // Live rectangle rendered while the user drags across empty canvas to
  // lasso-select multiple fields into a group.
  const [marqueeRect, setMarqueeRect] = useState<{
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  } | null>(null);
  // Suppresses the trailing background click after a marquee drag so it
  // doesn't immediately clear the group we just selected.
  const suppressNextBgClickRef = useRef<boolean>(false);
  const dragKindRef = useRef<FieldKind | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // ---------------------------------------------------------------- snap
  // Alignment guides surfaced while dragging a field that edges/centers
  // within SNAP_THRESHOLD of another field on the same page. Each guide is
  // a full-width (h) or full-height (v) line anchored to the snap position.
  const [snapGuides, setSnapGuides] = useState<
    ReadonlyArray<{ readonly orientation: 'h' | 'v'; readonly pos: number }>
  >([]);
  // --------------------------------------------------------------- history
  // Undo stack: snapshots of `fields` taken right before each discrete
  // mutation (drop, delete, duplicate, paste). Move/resize aren't recorded
  // so a long drag doesn't flood the stack with micro-states.
  const undoStackRef = useRef<ReadonlyArray<ReadonlyArray<PlacedFieldValue>>>([]);
  // Cmd+C snapshot — the fields the user most recently copied. Stored in a
  // ref (not state) because paste doesn't need to re-render on copy.
  const clipboardRef = useRef<ReadonlyArray<PlacedFieldValue>>([]);

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
  const fieldsSummary = useMemo(
    () =>
      fields.map((f) => ({
        id: f.id,
        type: f.type,
        page: f.page,
        signerIds: f.signerIds,
      })),
    [fields],
  );
  const pagesWithFields = useMemo(() => Array.from(new Set(fields.map((f) => f.page))), [fields]);
  // Per-kind tally of placed fields across the whole document. Passed to the
  // FieldPalette so each row shows how many of that kind are currently placed.
  const usageByKind = useMemo<Partial<Record<FieldKind, number>>>(() => {
    const tally: Partial<Record<FieldKind, number>> = {};
    fields.forEach((f) => {
      tally[f.type] = (tally[f.type] ?? 0) + 1;
    });
    return tally;
  }, [fields]);
  const existingContactIds = useMemo(
    () => signers.map((s) => s.id).filter((id) => contacts.some((c) => c.id === id)),
    [signers, contacts],
  );

  const singleSelectedId = useMemo<string | null>(
    () => (selectedIds.length === 1 ? (selectedIds[0] ?? null) : null),
    [selectedIds],
  );

  // Axis-aligned bounding box of the multi-field selection on the current
  // page. Used to anchor BOTH the group toolbar (Duplicate/Remove-all) above
  // the selection AND a dashed boundary rectangle drawn around it so users
  // can see at a glance what's grouped. Null when there's no group on this
  // page.
  const groupRect = useMemo<{
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  } | null>(() => {
    if (selectedIds.length < 2) return null;
    const picked = fields.filter((f) => f.page === currentPage && selectedIds.includes(f.id));
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
    // Guard against non-finite coords (e.g. synthetic drops in tests where
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
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [fields, currentPage, selectedIds]);

  const signerPopoverField = useMemo(
    () => (signerPopoverFor ? fields.find((f) => f.id === signerPopoverFor) : undefined),
    [signerPopoverFor, fields],
  );
  const pagesPopoverField = useMemo(
    () => (pagesPopoverFor ? fields.find((f) => f.id === pagesPopoverFor) : undefined),
    [pagesPopoverFor, fields],
  );

  // --------------------------------------------------------------- history
  /**
   * Snapshot the current `fields` for undo. Called right before every
   * discrete mutation (drop, delete, paste, duplicate) — NOT for
   * move/resize, which would otherwise flood the stack during a single
   * drag.
   */
  const pushUndo = useCallback((snapshot: ReadonlyArray<PlacedFieldValue>): void => {
    const next = [...undoStackRef.current, snapshot];
    // Cap history so a long session doesn't grow unbounded.
    undoStackRef.current =
      next.length > UNDO_HISTORY_LIMIT ? next.slice(next.length - UNDO_HISTORY_LIMIT) : next;
  }, []);

  // -------------------------------------------------------------------- DnD
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
    (e: DragEvent<HTMLDivElement>): void => {
      const kind = dragKindRef.current;
      if (!kind) return;
      e.preventDefault();
      const rect = canvasRef.current?.getBoundingClientRect();
      const x = Math.max(0, Math.round(e.clientX - (rect?.left ?? 0) - FIELD_WIDTH / 2));
      const y = Math.max(0, Math.round(e.clientY - (rect?.top ?? 0) - FIELD_HEIGHT / 2));

      // Dropping a field assigns it to every current signer — but each signer
      // gets their OWN independent field (offset so they're visible), rather
      // than a single field shared by many signers. Users can reassign or
      // delete individual fields from there.
      if (signers.length === 0) {
        // With no signers configured there's nothing to split — fall back to a
        // single unassigned field and prompt the user to pick signers.
        const fallback: PlacedFieldValue = {
          id: makeId(),
          page: currentPage,
          type: kind,
          x,
          y,
          signerIds: [],
        };
        pushUndo(fields);
        onFieldsChange([...fields, fallback]);
        setSelectedIds([fallback.id]);
        setSignerPopoverFor(fallback.id);
        dragKindRef.current = null;
        return;
      }

      // Lay siblings out side-by-side along x so all N fields are visible
      // side-by-side at the drop site rather than overlapping.
      const step = FIELD_WIDTH + DROP_SIBLING_GAP;
      const spawned: ReadonlyArray<PlacedFieldValue> = signers.map((signer, i) => ({
        id: makeId(),
        page: currentPage,
        type: kind,
        x: x + i * step,
        y,
        signerIds: [signer.id],
      }));
      pushUndo(fields);
      onFieldsChange([...fields, ...spawned]);
      // Select them all as a group so the user can immediately drag the whole
      // row or delete it as one.
      setSelectedIds(spawned.map((f) => f.id));
      // No signer popover: the split already encodes the per-signer intent.
      setSignerPopoverFor(null);
      dragKindRef.current = null;
    },
    [currentPage, fields, onFieldsChange, pushUndo, signers],
  );

  const handleCanvasBackgroundClick = useCallback((): void => {
    // A marquee drag fires `mouseup` followed by a synthetic click on the
    // canvas — honor the suppression flag so we don't wipe out the group the
    // drag just selected.
    if (suppressNextBgClickRef.current) {
      suppressNextBgClickRef.current = false;
      return;
    }
    // PlacedField stops propagation on its own click handler, so any click that
    // reaches the canvas root lands on empty background — clear the selection
    // to ungroup.
    setSelectedIds([]);
  }, []);

  const handleCanvasMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      // PlacedField and its overlay controls stop propagation on their own
      // mousedown handlers, so anything that reaches us originated on empty
      // canvas background — the user is starting a lasso selection.
      if (e.button !== 0) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const startX = e.clientX - rect.left;
      const startY = e.clientY - rect.top;
      let moved = false;
      let curX = startX;
      let curY = startY;

      const onMove = (ev: MouseEvent): void => {
        curX = ev.clientX - rect.left;
        curY = ev.clientY - rect.top;
        if (!moved && Math.hypot(curX - startX, curY - startY) < MARQUEE_THRESHOLD) return;
        moved = true;
        setMarqueeRect({
          x: Math.min(startX, curX),
          y: Math.min(startY, curY),
          w: Math.abs(curX - startX),
          h: Math.abs(curY - startY),
        });
      };

      const onUp = (): void => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        setMarqueeRect(null);
        if (!moved) return;
        // Commit the group: every field on the current page whose bounding
        // box intersects the marquee becomes selected.
        const r = {
          x: Math.min(startX, curX),
          y: Math.min(startY, curY),
          w: Math.abs(curX - startX),
          h: Math.abs(curY - startY),
        };
        const hit = fields
          .filter((f) => f.page === currentPage)
          .filter((f) => {
            const fw = f.width ?? FIELD_WIDTH;
            const fh = f.height ?? FIELD_HEIGHT;
            return f.x < r.x + r.w && f.x + fw > r.x && f.y < r.y + r.h && f.y + fh > r.y;
          });
        setSelectedIds(hit.map((f) => f.id));
        setSignerPopoverFor(null);
        setPagesPopoverFor(null);
        suppressNextBgClickRef.current = true;
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [fields, currentPage],
  );

  // --------------------------------------------------------------- mutations
  const moveField = useCallback(
    (id: string, x: number, y: number): void => {
      const anchor = fields.find((f) => f.id === id);
      if (!anchor) return;
      const w = anchor.width ?? FIELD_WIDTH;
      const h = anchor.height ?? FIELD_HEIGHT;
      const grouped = selectedIds.includes(id) && selectedIds.length > 1;
      // Peers to snap against: same page, not currently being moved.
      const movingSet = grouped ? new Set(selectedIds) : new Set<string>([id]);
      const peers = fields.filter((f) => f.page === anchor.page && !movingSet.has(f.id));

      // --- Horizontal snapping (vertical guide lines) ---
      let snappedX = x;
      const vGuides: Array<{ readonly orientation: 'v'; readonly pos: number }> = [];
      for (const p of peers) {
        const pw = p.width ?? FIELD_WIDTH;
        if (Math.abs(x - p.x) <= SNAP_THRESHOLD) {
          snappedX = p.x;
          vGuides.push({ orientation: 'v', pos: p.x });
          break;
        }
        if (Math.abs(x + w - (p.x + pw)) <= SNAP_THRESHOLD) {
          snappedX = p.x + pw - w;
          vGuides.push({ orientation: 'v', pos: p.x + pw });
          break;
        }
        if (Math.abs(x + w / 2 - (p.x + pw / 2)) <= SNAP_THRESHOLD) {
          snappedX = p.x + pw / 2 - w / 2;
          vGuides.push({ orientation: 'v', pos: p.x + pw / 2 });
          break;
        }
      }

      // --- Vertical snapping (horizontal guide lines) ---
      let snappedY = y;
      const hGuides: Array<{ readonly orientation: 'h'; readonly pos: number }> = [];
      for (const p of peers) {
        const ph = p.height ?? FIELD_HEIGHT;
        if (Math.abs(y - p.y) <= SNAP_THRESHOLD) {
          snappedY = p.y;
          hGuides.push({ orientation: 'h', pos: p.y });
          break;
        }
        if (Math.abs(y + h - (p.y + ph)) <= SNAP_THRESHOLD) {
          snappedY = p.y + ph - h;
          hGuides.push({ orientation: 'h', pos: p.y + ph });
          break;
        }
        if (Math.abs(y + h / 2 - (p.y + ph / 2)) <= SNAP_THRESHOLD) {
          snappedY = p.y + ph / 2 - h / 2;
          hGuides.push({ orientation: 'h', pos: p.y + ph / 2 });
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

  const removeField = useCallback(
    (id: string): void => {
      pushUndo(fields);
      onFieldsChange(fields.filter((f) => f.id !== id));
      if (selectedIds.includes(id)) {
        setSelectedIds((prev) => prev.filter((sid) => sid !== id));
      }
      if (signerPopoverFor === id) setSignerPopoverFor(null);
      if (pagesPopoverFor === id) setPagesPopoverFor(null);
    },
    [fields, onFieldsChange, pagesPopoverFor, pushUndo, selectedIds, signerPopoverFor],
  );

  /**
   * Sidebar action — clone the single field at `id` in place (with a small
   * offset so the copy is visible) and select the new copy. Called from the
   * FieldsPlacedList row's Duplicate button.
   */
  const duplicateField = useCallback(
    (id: string): void => {
      const source = fields.find((f) => f.id === id);
      if (!source) return;
      const clone: PlacedFieldValue = {
        ...source,
        id: makeId(),
        x: source.x + PASTE_OFFSET,
        y: source.y + PASTE_OFFSET,
      };
      pushUndo(fields);
      onFieldsChange([...fields, clone]);
      setSelectedIds([clone.id]);
    },
    [fields, onFieldsChange, pushUndo],
  );

  // --------------------------------------------------------- group actions
  // When more than one field is selected, expose Duplicate-all and Remove-all
  // so users don't have to act on each field individually.
  const removeSelectedGroup = useCallback((): void => {
    if (selectedIds.length < 2) return;
    pushUndo(fields);
    onFieldsChange(fields.filter((f) => !selectedIds.includes(f.id)));
    setSelectedIds([]);
    setSignerPopoverFor(null);
    setPagesPopoverFor(null);
  }, [fields, onFieldsChange, pushUndo, selectedIds]);

  const duplicateSelectedGroup = useCallback((): void => {
    if (selectedIds.length < 2) return;
    // Open the Place-on-pages popover so the user can choose which pages to
    // clone the whole group onto (All pages, All but last, Custom, etc.),
    // matching the single-field duplicate flow instead of doing an in-place
    // paste-offset copy.
    setGroupPagesPopoverOpen(true);
  }, [selectedIds]);

  const applySignerSelection = useCallback(
    (ids: ReadonlyArray<string>): void => {
      if (!signerPopoverFor) return;
      onFieldsChange(fields.map((f) => (f.id === signerPopoverFor ? { ...f, signerIds: ids } : f)));
      setSignerPopoverFor(null);
    },
    [fields, onFieldsChange, signerPopoverFor],
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
      const clones: ReadonlyArray<PlacedFieldValue> = targets.map((page) => ({
        id: makeId(),
        page,
        type: source.type,
        x: source.x,
        y: source.y,
        signerIds: source.signerIds,
      }));
      pushUndo(fields);
      onFieldsChange([...fields, ...clones]);
      setPagesPopoverFor(null);
    },
    [fields, onFieldsChange, pagesPopoverField, pushUndo, totalPages],
  );

  // Apply the Place-on-pages selection for a multi-field group: clone every
  // selected field (anchored to the current page) onto each chosen target
  // page, preserving each field's x/y/type/signer assignment.
  const applyGroupPagesSelection = useCallback(
    (mode: PlacePagesMode, customPages?: ReadonlyArray<number>): void => {
      if (selectedIds.length < 2) {
        setGroupPagesPopoverOpen(false);
        return;
      }
      const sourceFields = fields.filter(
        (f) => f.page === currentPage && selectedIds.includes(f.id),
      );
      if (sourceFields.length === 0) {
        setGroupPagesPopoverOpen(false);
        return;
      }
      const targets = resolveTargetPages(mode, currentPage, totalPages, customPages);
      if (targets.length === 0) {
        setGroupPagesPopoverOpen(false);
        return;
      }
      const clones: ReadonlyArray<PlacedFieldValue> = targets.flatMap((page) =>
        sourceFields.map((f) => ({
          ...f,
          id: makeId(),
          page,
        })),
      );
      pushUndo(fields);
      onFieldsChange([...fields, ...clones]);
      setGroupPagesPopoverOpen(false);
    },
    [fields, onFieldsChange, pushUndo, selectedIds, currentPage, totalPages],
  );

  // --------------------------------------------------------- keyboard
  /**
   * Copy the currently selected fields onto the internal clipboard. Stored in
   * a ref (not state) so paste doesn't depend on re-render. Deep-ish copy —
   * each clone keeps the original's type/coords/signer assignment.
   */
  const copySelection = useCallback((): void => {
    if (selectedIds.length === 0) return;
    const picked = fields.filter((f) => selectedIds.includes(f.id));
    if (picked.length === 0) return;
    clipboardRef.current = picked;
  }, [fields, selectedIds]);

  /**
   * Paste the most-recently-copied fields onto the current page at a small
   * offset so they don't hide the originals. Each paste produces fresh ids
   * and selects the new fields as a group.
   */
  const pasteClipboard = useCallback((): void => {
    const clip = clipboardRef.current;
    if (clip.length === 0) return;
    const clones: ReadonlyArray<PlacedFieldValue> = clip.map((f) => ({
      ...f,
      id: makeId(),
      page: currentPage,
      x: f.x + PASTE_OFFSET,
      y: f.y + PASTE_OFFSET,
    }));
    pushUndo(fields);
    onFieldsChange([...fields, ...clones]);
    setSelectedIds(clones.map((f) => f.id));
  }, [currentPage, fields, onFieldsChange, pushUndo]);

  /**
   * Pop the most recent snapshot off the undo stack and restore it. Clears
   * downstream state (popovers, selection) since the ids in the restored
   * snapshot may no longer match what the user currently has selected.
   */
  const undo = useCallback((): void => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const last = stack[stack.length - 1];
    if (!last) return;
    undoStackRef.current = stack.slice(0, -1);
    onFieldsChange(last);
    setSelectedIds((prev) => prev.filter((id) => last.some((f) => f.id === id)));
    setSignerPopoverFor(null);
    setPagesPopoverFor(null);
    setGroupPagesPopoverOpen(false);
  }, [onFieldsChange]);

  /**
   * Remove every selected field (single or group) in one mutation. Used by
   * Delete/Backspace key handler so users don't have to click the X.
   */
  const removeSelection = useCallback((): void => {
    if (selectedIds.length === 0) return;
    pushUndo(fields);
    onFieldsChange(fields.filter((f) => !selectedIds.includes(f.id)));
    setSelectedIds([]);
    setSignerPopoverFor(null);
    setPagesPopoverFor(null);
  }, [fields, onFieldsChange, pushUndo, selectedIds]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Don't intercept shortcuts while the user is typing in an input/textarea
      // or a contenteditable surface (e.g. popover filters).
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isTyping =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (target?.isContentEditable ?? false);
      if (isTyping) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'c' || e.key === 'C')) {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && (e.key === 'v' || e.key === 'V')) {
        if (clipboardRef.current.length === 0) return;
        e.preventDefault();
        pasteClipboard();
        return;
      }
      if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        if (undoStackRef.current.length === 0) return;
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        removeSelection();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [copySelection, pasteClipboard, removeSelection, selectedIds, undo]);

  // ----------------------------------------------------------------- signer
  const handlePickContact = useCallback(
    (contact: AddSignerContact): void => {
      onAddSignerFromContact?.(contact);
      setAddSignerOpen(false);
    },
    [onAddSignerFromContact],
  );

  const handleCreateSigner = useCallback(
    (name: string, email: string): void => {
      onCreateSigner?.(name, email);
      setAddSignerOpen(false);
    },
    [onCreateSigner],
  );

  // ------------------------------------------------------------------ chrome
  const logoNode: ReactNode = onLogoClick ? (
    <button
      type="button"
      onClick={onLogoClick}
      aria-label="Go home"
      style={{
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      Sealed
    </button>
  ) : undefined;

  // ------------------------------------------------------------------ render
  return (
    <Shell {...rest} ref={ref}>
      <NavBar
        activeItemId={activeNavId}
        onSelectItem={onSelectNavItem}
        {...(user ? { user } : {})}
        {...(logoNode ? { logo: logoNode } : {})}
      />
      <Body>
        <SideBar
          activeItemId="drafts"
          primaryAction={{ label: 'New document', onClick: () => {} }}
        />
        <Workspace>
          <CollapsibleRail
            side="left"
            title="Fields"
            open={leftOpen}
            onOpenChange={setLeftOpen}
            width={leftWidth}
            onWidthChange={setLeftWidth}
            minW={200}
            maxW={360}
          >
            <FieldPalette
              {...(availableFieldKinds ? { kinds: availableFieldKinds } : {})}
              {...(requiredFieldKinds ? { requiredKinds: requiredFieldKinds } : {})}
              usageByKind={usageByKind}
              onFieldDragStart={handlePaletteDragStart}
              onFieldDragEnd={handlePaletteDragEnd}
            />
          </CollapsibleRail>

          <Center>
            <CenterHeader>
              <CenterHeaderSide>
                {onBack ? (
                  <Button variant="ghost" iconLeft={ArrowLeft} size="sm" onClick={onBack}>
                    Back
                  </Button>
                ) : null}
              </CenterHeaderSide>
              <PageToolbar
                currentPage={currentPage}
                totalPages={totalPages}
                onPrevPage={() => setCurrentPage((p) => Math.max(1, p - 1))}
                onNextPage={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              />
              <CenterHeaderSide aria-hidden />
            </CenterHeader>

            <CanvasWrap>
              <DocumentCanvas
                ref={canvasRef}
                currentPage={currentPage}
                totalPages={totalPages}
                {...(title ? { title } : {})}
                {...(docId ? { docId } : {})}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
                onClick={handleCanvasBackgroundClick}
                onMouseDown={handleCanvasMouseDown}
              >
                {fields
                  .filter((f) => f.page === currentPage)
                  .map((field) => {
                    const isSelected = selectedIds.includes(field.id);
                    const inGroup = isSelected && selectedIds.length > 1;
                    return (
                      <PlacedField
                        key={field.id}
                        field={field}
                        signers={placedFieldSigners}
                        selected={isSelected}
                        inGroup={inGroup}
                        {...((canvasRef as { current: HTMLDivElement | null })
                          ? { canvasRef: canvasRef as React.RefObject<HTMLElement> }
                          : {})}
                        onSelect={(e) => {
                          e.stopPropagation();
                          const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                          if (additive) {
                            setSelectedIds((prev) =>
                              prev.includes(field.id)
                                ? prev.filter((id) => id !== field.id)
                                : [...prev, field.id],
                            );
                          } else {
                            // A plain click always isolates this field to a
                            // single selection — including when it was part of
                            // a multi-selection. PlacedField defers this call
                            // until after mouseup so an actual drag keeps the
                            // group intact while moving.
                            setSelectedIds([field.id]);
                          }
                          setSignerPopoverFor(null);
                          setPagesPopoverFor(null);
                        }}
                        onOpenSignerPopover={(e) => {
                          e.stopPropagation();
                          setSignerPopoverFor(field.id);
                        }}
                        onOpenPagesPopover={(e) => {
                          e.stopPropagation();
                          setPagesPopoverFor(field.id);
                        }}
                        onRemove={() => removeField(field.id)}
                        onToggleRequired={toggleRequired}
                        onMove={moveField}
                        onResize={resizeField}
                        onDragEnd={() => setSnapGuides([])}
                      />
                    );
                  })}
                {marqueeRect ? (
                  <MarqueeRect
                    data-testid="canvas-marquee"
                    style={{
                      left: marqueeRect.x,
                      top: marqueeRect.y,
                      width: marqueeRect.w,
                      height: marqueeRect.h,
                    }}
                  />
                ) : null}
                {snapGuides.map((g, i) => (
                  <SnapGuide
                    // Positional keys are fine here — guides are short-lived
                    // drag-time state with no stable identity of their own.
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${g.orientation}-${String(g.pos)}-${String(i)}`}
                    data-testid="snap-guide"
                    $orientation={g.orientation}
                    style={g.orientation === 'v' ? { left: g.pos } : { top: g.pos }}
                  />
                ))}
                {groupRect ? (
                  // Dashed rectangle drawn around every selected field's
                  // bounding box on the current page. Purely decorative —
                  // pointer events pass through to the fields beneath.
                  <GroupBoundary
                    data-testid="group-boundary"
                    style={{
                      left: groupRect.x - 6,
                      top: groupRect.y - 6,
                      width: groupRect.w + 12,
                      height: groupRect.h + 12,
                    }}
                  />
                ) : null}
                {groupRect ? (
                  <GroupToolbar
                    data-testid="group-toolbar"
                    style={{
                      left: groupRect.x,
                      top: Math.max(0, groupRect.y - 40),
                      // Let the toolbar hug its content; the anchoring `left`
                      // places it at the left edge of the bounding box.
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <GroupToolbarLabel>{selectedIds.length} selected</GroupToolbarLabel>
                    <GroupToolbarButton
                      type="button"
                      $tone="indigo"
                      aria-label="Duplicate selected fields"
                      onClick={duplicateSelectedGroup}
                    >
                      <Copy size={14} strokeWidth={1.75} aria-hidden />
                    </GroupToolbarButton>
                    <GroupToolbarButton
                      type="button"
                      $tone="danger"
                      aria-label="Delete selected fields"
                      onClick={removeSelectedGroup}
                    >
                      <XIcon size={14} strokeWidth={1.75} aria-hidden />
                    </GroupToolbarButton>
                  </GroupToolbar>
                ) : null}
              </DocumentCanvas>
            </CanvasWrap>

            <PageThumbStrip
              totalPages={totalPages}
              currentPage={currentPage}
              onSelectPage={setCurrentPage}
              pagesWithFields={pagesWithFields}
            />
          </Center>

          <CollapsibleRail
            side="right"
            title="Ready to send"
            open={rightOpen}
            onOpenChange={setRightOpen}
            width={rightWidth}
            onWidthChange={setRightWidth}
            minW={280}
            maxW={440}
            noPad
          >
            <RightRailInner>
              <RightRailScroll>
                <div style={ADDDROPDOWN_WRAP_STYLE}>
                  {addSignerOpen ? (
                    <AddSignerDropdown
                      contacts={contacts}
                      existingContactIds={existingContactIds}
                      onPick={handlePickContact}
                      onCreate={handleCreateSigner}
                      onClose={() => setAddSignerOpen(false)}
                    />
                  ) : null}
                </div>
                <SignersPanel
                  signers={panelSigners}
                  onRequestAdd={() => setAddSignerOpen((v) => !v)}
                  {...(onRemoveSigner ? { onRemoveSigner } : {})}
                />
                <FieldsPlacedList
                  fields={fieldsSummary}
                  signers={placedFieldSigners}
                  {...(singleSelectedId !== null ? { selectedFieldId: singleSelectedId } : {})}
                  onSelectField={(id) => {
                    const f = fields.find((x) => x.id === id);
                    if (f) setCurrentPage(f.page);
                    setSelectedIds([id]);
                  }}
                  onDuplicateField={duplicateField}
                  onRemoveField={removeField}
                />
              </RightRailScroll>
              <RightRailFooter>
                <SendPanelFooter
                  fieldCount={fields.length}
                  signerCount={signers.length}
                  onSend={onSend}
                  {...(onSaveDraft ? { onSaveDraft } : {})}
                />
              </RightRailFooter>
            </RightRailInner>
          </CollapsibleRail>
        </Workspace>
      </Body>

      <SelectSignersPopover
        // `key` ties the popover's identity to the field being edited so it
        // fully remounts between fields — never carrying stale selection.
        key={signerPopoverFor ?? 'closed'}
        open={signerPopoverFor !== null}
        signers={popoverSigners}
        {...(signerPopoverField ? { initialSelectedIds: signerPopoverField.signerIds } : {})}
        onApply={applySignerSelection}
        onCancel={() => setSignerPopoverFor(null)}
      />
      <PlaceOnPagesPopover
        open={pagesPopoverFor !== null}
        currentPage={pagesPopoverField?.page ?? currentPage}
        totalPages={totalPages}
        onApply={applyPagesSelection}
        onCancel={() => setPagesPopoverFor(null)}
      />
      {/* Place-on-pages popover for a multi-field selection. Applies the
          chosen mode to every selected field at once. */}
      <PlaceOnPagesPopover
        open={groupPagesPopoverOpen}
        currentPage={currentPage}
        totalPages={totalPages}
        onApply={applyGroupPagesSelection}
        onCancel={() => setGroupPagesPopoverOpen(false)}
      />
    </Shell>
  );
});

DocumentPage.displayName = 'DocumentPage';
