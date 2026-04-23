import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { PageThumbRail } from '../../components/PageThumbRail';
import { PageToolbar } from '../../components/PageToolbar';
import { PlaceOnPagesPopover } from '../../components/PlaceOnPagesPopover';
import type { PlacePagesMode } from '../../components/PlaceOnPagesPopover/PlaceOnPagesPopover.types';
import { PlacedField } from '../../components/PlacedField';
import type { PlacedFieldValue } from '../../components/PlacedField/PlacedField.types';
import { RemoveLinkedCopiesDialog } from '../../components/RemoveLinkedCopiesDialog';
import type { RemoveLinkedScope } from '../../components/RemoveLinkedCopiesDialog';
import { SelectSignersPopover } from '../../components/SelectSignersPopover';
import { SendPanelFooter } from '../../components/SendPanelFooter';
import { SignersPanel } from '../../components/SignersPanel';
import type { FieldKind } from '../../types/sealdTypes';
import type { DocumentPageProps } from './DocumentPage.types';
import {
  Body,
  CanvasScaleInner,
  CanvasScaler,
  CanvasScroll,
  CanvasWrap,
  Center,
  CenterHeader,
  CenterHeaderSide,
  CenterInner,
  CenterTop,
  GroupBoundary,
  GroupToolbar,
  GroupToolbarButton,
  GroupToolbarLabel,
  MarqueeRect,
  PageStack,
  RailSlot,
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
// Zoom range + step for the canvas. 25% granularity matches how most PDF
// viewers (Preview, Acrobat) bucket their +/- clicks and keeps the percentage
// readout tidy (50/75/100/125…).
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.25;
const ZOOM_DEFAULT = 1;

function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}
const ADDDROPDOWN_WRAP_STYLE: React.CSSProperties = {
  position: 'relative',
  height: 0,
};

function makeId(): string {
  // RFC-style compact id — good enough for DOM keys and internal refs.
  return `f_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function makeLinkId(): string {
  // Shared id assigned to every field in a single Place-on-pages action so
  // the Remove dialog can find and operate on all linked copies together.
  return `l_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
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
    pdfDoc,
    pdfLoading,
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
    activeNavId = 'sign',
    navMode,
    onSignIn,
    onSignUp,
    onSignOut,
    ...rest
  } = props;

  const [currentPage, setCurrentPage] = useState<number>(() =>
    Math.min(Math.max(initialPage, 1), totalPages),
  );
  // When a PDF loads asynchronously, `totalPages` can jump from a stale
  // placeholder (e.g. 1) to the real count. Clamp the current page so an
  // out-of-range value doesn't linger and break navigation.
  useEffect(() => {
    setCurrentPage((p) => Math.min(Math.max(p, 1), Math.max(1, totalPages)));
  }, [totalPages]);
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
    readonly page: number;
  } | null>(null);
  // Suppresses the trailing background click after a marquee drag so it
  // doesn't immediately clear the group we just selected.
  const suppressNextBgClickRef = useRef<boolean>(false);
  const dragKindRef = useRef<FieldKind | null>(null);
  // One canvas element per page (continuous scroll mode). Keyed by page number
  // so per-page event handlers (drop, marquee, click) can get the rect of the
  // page they were invoked on instead of a single "current" canvas.
  const canvasRefsRef = useRef<Map<number, HTMLDivElement | null>>(new Map());
  // One scrollable page wrap per page. Used to (a) feed the IntersectionObserver
  // that derives `currentPage` from scroll position, and (b) scroll a specific
  // page into view when the user clicks a rail thumbnail / prev-next / a
  // FieldsPlacedList row.
  const pageWrapRefsRef = useRef<Map<number, HTMLDivElement | null>>(new Map());
  // Scroll container that hosts the page stack. Needed as the observer root so
  // the chosen page reflects what's visible inside THIS viewport, not the
  // document viewport (which would never intersect if the page is taller than
  // the screen).
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  // Stable per-page ref setters. Cached so the JSX doesn't hand a fresh
  // function to every `<Paper ref={...}>` on every render, which would
  // otherwise reset the ref map twice per render cycle.
  const setCanvasRefForPage = useCallback(
    (p: number) =>
      (el: HTMLDivElement | null): void => {
        canvasRefsRef.current.set(p, el);
      },
    [],
  );
  const setPageWrapRefForPage = useCallback(
    (p: number) =>
      (el: HTMLDivElement | null): void => {
        pageWrapRefsRef.current.set(p, el);
      },
    [],
  );
  // ---------------------------------------------------------------- snap
  // Alignment guides surfaced while dragging a field that edges/centers
  // within SNAP_THRESHOLD of another field on the same page. Each guide is
  // a full-width (h) or full-height (v) line anchored to the snap position
  // and tagged with the page it belongs to so the right page renders it.
  const [snapGuides, setSnapGuides] = useState<
    ReadonlyArray<{
      readonly orientation: 'h' | 'v';
      readonly pos: number;
      readonly page: number;
    }>
  >([]);
  // --------------------------------------------------------------- history
  // Undo stack: snapshots of `fields` taken right before each discrete
  // mutation (drop, delete, duplicate, paste). Move/resize aren't recorded
  // so a long drag doesn't flood the stack with micro-states.
  const undoStackRef = useRef<ReadonlyArray<ReadonlyArray<PlacedFieldValue>>>([]);
  // Cmd+C snapshot — the fields the user most recently copied. Stored in a
  // ref (not state) because paste doesn't need to re-render on copy.
  const clipboardRef = useRef<ReadonlyArray<PlacedFieldValue>>([]);
  // ----------------------------------------------------------------- zoom
  // Canvas zoom factor (1 = 100%). Applied via CSS transform on the scaler
  // wrapper so the PDF canvas + every field + marquee + snap guides scale
  // together; pointer math below divides by this factor to stay in the
  // native coord space.
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT);
  // Base (pre-transform) paper dimensions. Tracked so the scaler wrapper can
  // reserve `size × zoom` of layout space — CSS transforms don't reflow, so
  // without an explicit sized wrapper the page wouldn't scroll to the zoomed
  // paper's edges.
  const [paperSize, setPaperSize] = useState<{ readonly width: number; readonly height: number }>({
    width: 560,
    height: 740,
  });
  // All pages share the same paper size in this app, so we measure page 1's
  // canvas as the canonical dimension and drive every page's scaler wrapper
  // from it. Re-runs when `pdfDoc` swaps so a newly-loaded PDF's true size is
  // picked up (the pre-load mock paper and the real PDF page differ in height).
  useLayoutEffect(() => {
    const el = canvasRefsRef.current.get(1);
    if (!el) return undefined;
    setPaperSize({ width: el.offsetWidth, height: el.offsetHeight });
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      setPaperSize({ width: el.offsetWidth, height: el.offsetHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdfDoc]);

  // ---------------------------------------------------------------- scroll
  // Pages whose scroll-parent intersection is > 0 (within a generous buffer)
  // are "live": we render their DocumentCanvas + fields. Off-screen pages get
  // a sized placeholder so scroll height stays correct without paying the
  // cost of rendering every page's PDF canvas up front. Start with page 1
  // in the live set so the initial render paints something even before the
  // observer has a chance to fire.
  const [visiblePages, setVisiblePages] = useState<ReadonlySet<number>>(() => new Set([1]));

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const scrollEl = canvasScrollRef.current;
    if (!scrollEl) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        // Track both which pages just became visible (for lazy rendering) and
        // which page has the highest intersection ratio (to drive currentPage).
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const pageAttr = entry.target.getAttribute('data-page');
            if (pageAttr && entry.isIntersecting) {
              next.add(Number(pageAttr));
            }
          }
          return next;
        });
        let bestPage: number | null = null;
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            const pageAttr = entry.target.getAttribute('data-page');
            if (pageAttr) bestPage = Number(pageAttr);
          }
        }
        if (bestPage !== null && bestRatio > 0) setCurrentPage(bestPage);
      },
      {
        root: scrollEl,
        // Keep a 1-viewport buffer above/below the visible area so the next
        // page is pre-rendered before the user reaches it — scrolling feels
        // seamless without paying for pages far outside view.
        rootMargin: '800px 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    // Observe every page wrap that's currently mounted. Re-observe when
    // totalPages changes (new wraps appear).
    pageWrapRefsRef.current.forEach((el) => {
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [totalPages]);

  const scrollToPage = useCallback((p: number): void => {
    const target = pageWrapRefsRef.current.get(p);
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    // Eagerly mark the target visible so its DocumentCanvas mounts even when
    // the IntersectionObserver doesn't fire (e.g. jsdom/tests, or smooth-scroll
    // races where the user jumps before the observer re-evaluates).
    setVisiblePages((prev) => {
      if (prev.has(p)) return prev;
      const next = new Set(prev);
      next.add(p);
      return next;
    });
    setCurrentPage(p);
  }, []);

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
  // Count of placed fields per page. Passed to the PageThumbRail so each
  // thumb can show an indigo badge with the number of fields on that page,
  // matching the design reference in `ui_kits/signing_app`.
  const fieldCountByPage = useMemo<Record<number, number>>(() => {
    const out: Record<number, number> = {};
    for (const f of fields) {
      out[f.page] = (out[f.page] ?? 0) + 1;
    }
    return out;
  }, [fields]);
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

  // Axis-aligned bounding box of the multi-field selection. In continuous
  // scroll mode the group lives on whichever page the selected fields are
  // on (users still can't multi-select across pages), so we derive the page
  // from the first selected field rather than from `currentPage` (which now
  // tracks scroll, not selection).
  const groupRect = useMemo<{
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    readonly page: number;
  } | null>(() => {
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

  // ----------------------------------------------------------------- zoom
  const zoomIn = useCallback((): void => {
    setZoom((z) => clampZoom(z + ZOOM_STEP));
  }, []);
  const zoomOut = useCallback((): void => {
    setZoom((z) => clampZoom(z - ZOOM_STEP));
  }, []);
  const resetZoom = useCallback((): void => {
    setZoom(ZOOM_DEFAULT);
  }, []);

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
    (e: DragEvent<HTMLDivElement>, dropPage: number): void => {
      const kind = dragKindRef.current;
      if (!kind) return;
      e.preventDefault();
      const rect = canvasRefsRef.current.get(dropPage)?.getBoundingClientRect();
      // Divide by `zoom` so drop coords land in the canvas's native
      // coordinate space regardless of how the paper is visually scaled.
      const localX = (e.clientX - (rect?.left ?? 0)) / zoom;
      const localY = (e.clientY - (rect?.top ?? 0)) / zoom;
      const x = Math.max(0, Math.round(localX - FIELD_WIDTH / 2));
      const y = Math.max(0, Math.round(localY - FIELD_HEIGHT / 2));

      // Every drop creates a single field and immediately opens the
      // "Select signers" popover so the user can confirm / adjust the
      // assignees. The field is pre-populated with every current signer so
      // the common case ("everyone signs this") is a single confirmation
      // click; the user can uncheck whoever shouldn't be on this field.
      const dropped: PlacedFieldValue = {
        id: makeId(),
        page: dropPage,
        type: kind,
        x,
        y,
        signerIds: signers.map((s) => s.id),
      };
      pushUndo(fields);
      onFieldsChange([...fields, dropped]);
      setSelectedIds([dropped.id]);
      setSignerPopoverFor(dropped.id);
      dragKindRef.current = null;
    },
    [fields, onFieldsChange, pushUndo, signers, zoom],
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
    (e: ReactMouseEvent<HTMLDivElement>, page: number): void => {
      // PlacedField and its overlay controls stop propagation on their own
      // mousedown handlers, so anything that reaches us originated on empty
      // canvas background — the user is starting a lasso selection on
      // whichever page's canvas they pressed.
      if (e.button !== 0) return;
      const canvas = canvasRefsRef.current.get(page);
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      // Marquee coords also live in the canvas's native space; divide by
      // `zoom` so the selection rectangle hits the right fields regardless
      // of visual scale.
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
        // Commit the group: every field on the page the drag started on
        // whose bounding box intersects the marquee becomes selected.
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
        setSelectedIds(hit.map((f) => f.id));
        setSignerPopoverFor(null);
        setPagesPopoverFor(null);
        suppressNextBgClickRef.current = true;
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [fields, zoom],
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
      const vGuides: Array<{
        readonly orientation: 'v';
        readonly pos: number;
        readonly page: number;
      }> = [];
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
      const hGuides: Array<{
        readonly orientation: 'h';
        readonly pos: number;
        readonly page: number;
      }> = [];
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

  // Actual removal — shared by the direct path (no linked copies) and the
  // "only this page" branch of the Remove linked copies dialog.
  const removeByIds = useCallback(
    (ids: ReadonlyArray<string>): void => {
      if (ids.length === 0) return;
      pushUndo(fields);
      onFieldsChange(fields.filter((f) => !ids.includes(f.id)));
      setSelectedIds((prev) => prev.filter((sid) => !ids.includes(sid)));
      if (signerPopoverFor && ids.includes(signerPopoverFor)) setSignerPopoverFor(null);
      if (pagesPopoverFor && ids.includes(pagesPopoverFor)) setPagesPopoverFor(null);
    },
    [fields, onFieldsChange, pagesPopoverFor, pushUndo, signerPopoverFor],
  );

  // Pending-remove state: set when the user tries to delete a field that has
  // linked copies on other pages, cleared once they pick a scope or cancel.
  // Tracks the ids the user attempted to remove; the set of linkIds they
  // belong to is derived from `fields` at confirm time so late edits can't
  // leave the dialog acting on stale data.
  const [pendingRemove, setPendingRemove] = useState<{
    readonly ids: ReadonlyArray<string>;
  } | null>(null);

  /**
   * Entry point for every remove path (X button, Delete/Backspace key, group
   * toolbar). If any target field belongs to a linked group whose peers live
   * on other pages, open the confirmation dialog so the user can choose
   * between "only this page" and "all pages". Otherwise remove immediately.
   */
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

  const removeField = useCallback(
    (id: string): void => {
      requestRemove([id]);
    },
    [requestRemove],
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
  // so users don't have to act on each field individually. Defer to
  // `requestRemove` so a group containing linked copies still surfaces the
  // "only this page / all pages" confirmation.
  const removeSelectedGroup = useCallback((): void => {
    if (selectedIds.length < 2) return;
    requestRemove(selectedIds);
  }, [requestRemove, selectedIds]);

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
      // Reuse the source's existing linkId if it already belongs to a linked
      // group (user is extending a previous Place-on-pages action), otherwise
      // mint a new one so the source + every clone share a common link.
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
    [fields, onFieldsChange, pagesPopoverField, pushUndo, totalPages],
  );

  // Apply the Place-on-pages selection for a multi-field group: clone every
  // selected field (anchored to the group's own page) onto each chosen target
  // page, preserving each field's x/y/type/signer assignment.
  //
  // The source page is derived from `groupRect.page` — NOT `currentPage` —
  // because in continuous-scroll mode `currentPage` tracks which page is
  // visible in the viewport, which can differ from the page where the
  // selected fields actually live (user scrolled after multi-selecting).
  // Using `currentPage` here caused the bug where "copy to all pages"
  // silently did nothing whenever the user scrolled before applying.
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
      // Each source field gets its OWN linkId (reused from its existing link
      // if present) so after the operation, a row of N sources becomes N
      // independent linked columns — one per column across the target pages.
      const linkIdBySource = new Map<string, string>();
      for (const f of sourceFields) {
        linkIdBySource.set(f.id, f.linkId ?? makeLinkId());
      }
      const clones: ReadonlyArray<PlacedFieldValue> = targets.flatMap((page) =>
        sourceFields.map((f) => ({
          ...f,
          id: makeId(),
          page,
          linkId: linkIdBySource.get(f.id),
        })),
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
    [fields, onFieldsChange, pushUndo, selectedIds, groupRect, totalPages],
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
   * Delete/Backspace key handler so users don't have to click the X. Routes
   * through `requestRemove` so a selection containing linked copies prompts
   * the confirmation dialog.
   */
  const removeSelection = useCallback((): void => {
    if (selectedIds.length === 0) return;
    requestRemove(selectedIds);
  }, [requestRemove, selectedIds]);

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
        return;
      }
      // Zoom shortcuts — match common browser/PDF viewer chords.
      //   Cmd/Ctrl + "=" or "+": zoom in
      //   Cmd/Ctrl + "-":         zoom out
      //   Cmd/Ctrl + "0":         reset to 100%
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
        return;
      }
      if (mod && e.key === '-') {
        e.preventDefault();
        zoomOut();
        return;
      }
      if (mod && e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    copySelection,
    pasteClipboard,
    removeSelection,
    resetZoom,
    selectedIds,
    undo,
    zoomIn,
    zoomOut,
  ]);

  // --------------------------------------------------- linked-remove dialog
  /**
   * Total number of fields the user would affect if they pick "All pages" in
   * the Remove linked copies dialog. Equals the number of fields the dialog
   * would delete: every pending id plus every peer that shares a linkId with
   * one of them.
   */
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
        {...(navMode ? { mode: navMode } : {})}
        {...(onSignIn ? { onSignIn } : {})}
        {...(onSignUp ? { onSignUp } : {})}
        {...(onSignOut ? { onSignOut } : {})}
      />
      <Body>
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
            <CenterTop>
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
                  onPrevPage={() => scrollToPage(Math.max(1, currentPage - 1))}
                  onNextPage={() => scrollToPage(Math.min(totalPages, currentPage + 1))}
                  zoom={zoom}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onResetZoom={resetZoom}
                  zoomInDisabled={zoom >= ZOOM_MAX - 1e-6}
                  zoomOutDisabled={zoom <= ZOOM_MIN + 1e-6}
                />
                <CenterHeaderSide aria-hidden />
              </CenterHeader>
            </CenterTop>

            <CanvasScroll ref={canvasScrollRef}>
              <CenterInner>
                <PageStack>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                    // Lazy-load heuristic: only mount the DocumentCanvas + fields
                    // when the page wrap has intersected the observer's root (with
                    // buffer). Off-screen pages render a sized placeholder so the
                    // scroll height stays correct without paying the cost of
                    // rasterizing every PDF page up front.
                    const isLive = visiblePages.has(pageNum);
                    const pageFields = fields.filter((f) => f.page === pageNum);
                    // Per-page ref object that PlacedField uses for pointer math.
                    // Keyed off the shared Map so drag/resize hits the right page
                    // regardless of which page fired the interaction.
                    const pageCanvasRef = {
                      get current() {
                        return canvasRefsRef.current.get(pageNum) ?? null;
                      },
                    } as React.RefObject<HTMLElement>;
                    return (
                      <CanvasWrap
                        key={pageNum}
                        data-page={pageNum}
                        ref={setPageWrapRefForPage(pageNum)}
                      >
                        <CanvasScaler
                          style={{
                            width: paperSize.width * zoom,
                            height: paperSize.height * zoom,
                          }}
                        >
                          <CanvasScaleInner
                            style={{
                              width: paperSize.width,
                              height: paperSize.height,
                              transform: `scale(${String(zoom)})`,
                            }}
                          >
                            {isLive ? (
                              <DocumentCanvas
                                ref={setCanvasRefForPage(pageNum)}
                                currentPage={pageNum}
                                totalPages={totalPages}
                                {...(title ? { title } : {})}
                                {...(docId ? { docId } : {})}
                                {...(pdfDoc ? { pdfDoc } : {})}
                                {...(pdfLoading ? { pdfLoading: true } : {})}
                                onDragOver={handleCanvasDragOver}
                                onDrop={(e) => handleCanvasDrop(e, pageNum)}
                                onClick={handleCanvasBackgroundClick}
                                onMouseDown={(e) => handleCanvasMouseDown(e, pageNum)}
                              >
                                {pageFields.map((field) => {
                                  const isSelected = selectedIds.includes(field.id);
                                  const inGroup = isSelected && selectedIds.length > 1;
                                  return (
                                    <PlacedField
                                      key={field.id}
                                      field={field}
                                      signers={placedFieldSigners}
                                      selected={isSelected}
                                      inGroup={inGroup}
                                      canvasRef={pageCanvasRef}
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
                                      zoom={zoom}
                                    />
                                  );
                                })}
                                {marqueeRect && marqueeRect.page === pageNum ? (
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
                                {snapGuides
                                  .filter((g) => g.page === pageNum)
                                  .map((g, i) => (
                                    <SnapGuide
                                      // Positional keys are fine here — guides are short-lived
                                      // drag-time state with no stable identity of their own.
                                      // eslint-disable-next-line react/no-array-index-key
                                      key={`${g.orientation}-${String(g.pos)}-${String(i)}`}
                                      data-testid="snap-guide"
                                      $orientation={g.orientation}
                                      style={
                                        g.orientation === 'v' ? { left: g.pos } : { top: g.pos }
                                      }
                                    />
                                  ))}
                                {groupRect && groupRect.page === pageNum ? (
                                  // Dashed rectangle drawn around every selected field's
                                  // bounding box on this page. Purely decorative —
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
                                {groupRect && groupRect.page === pageNum ? (
                                  <GroupToolbar
                                    data-testid="group-toolbar"
                                    style={{
                                      left: groupRect.x,
                                      top: Math.max(0, groupRect.y - 40),
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <GroupToolbarLabel>
                                      {selectedIds.length} selected
                                    </GroupToolbarLabel>
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
                            ) : null}
                          </CanvasScaleInner>
                        </CanvasScaler>
                      </CanvasWrap>
                    );
                  })}
                </PageStack>
              </CenterInner>
              <RailSlot>
                <PageThumbRail
                  totalPages={totalPages}
                  currentPage={currentPage}
                  onSelectPage={scrollToPage}
                  fieldCountByPage={fieldCountByPage}
                />
              </RailSlot>
            </CanvasScroll>
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
                    if (f) scrollToPage(f.page);
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
        currentPage={groupRect?.page ?? currentPage}
        totalPages={totalPages}
        onApply={applyGroupPagesSelection}
        onCancel={() => setGroupPagesPopoverOpen(false)}
      />
      <RemoveLinkedCopiesDialog
        open={pendingRemove !== null}
        linkedCount={pendingLinkedCount}
        onConfirm={handleRemoveLinkedConfirm}
        onCancel={handleRemoveLinkedCancel}
      />
    </Shell>
  );
});

DocumentPage.displayName = 'DocumentPage';
