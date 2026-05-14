import { useLayoutEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { PdfPageView } from '@/components/PdfPageView/PdfPageView';
import type { PDFDocumentProxy } from '@/lib/pdf';
import {
  Calendar,
  CheckSquare,
  Copy,
  Link2,
  Move,
  PenTool,
  Square,
  Trash2,
  Type,
  Users,
  X as XIcon,
} from 'lucide-react';
import { PageFilmstrip } from '../components/PageFilmstrip';
import { fieldsOnPage } from '../model';
import {
  getFieldDef,
  MOBILE_FIELD_DEFS,
  type MobileFieldType,
  type MobilePlacedField,
  type MobileSigner,
} from '../types';

/** Minimum pointer movement (px) before a tap becomes a drag gesture. */
const DRAG_THRESHOLD_PX = 4;

const Section = styled.div`
  padding: 0;
  position: relative;
`;

const HeadRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 4px;
`;

const PageEyebrow = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: var(--fg-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const ArmedHint = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 10px;
  background: var(--indigo-50);
  color: var(--indigo-700);
  font-size: 11px;
  font-weight: 700;
`;

const SwipeHint = styled.div`
  font-size: 11px;
  color: var(--fg-3);
`;

const CanvasWrap = styled.div`
  padding: 4px 12px 0;
  position: relative;
`;

const Canvas = styled.div<{ $armed: boolean; $hasDoc: boolean }>`
  background: #fff;
  box-shadow:
    0 1px 2px rgba(11, 18, 32, 0.06),
    0 12px 32px rgba(11, 18, 32, 0.08);
  border-radius: 8px;
  /* QA-2026-05-02 (Bug 1): when a real PDF is mounted we drop the inner
     padding so PdfPageView fills the full canvas (which is what a phone
     reader expects) and let intrinsic page height drive the box. The
     placeholder still uses a 340 px height so empty-state framing stays
     stable. */
  padding: ${({ $hasDoc }) => ($hasDoc ? '0' : '24px 22px')};
  position: relative;
  ${({ $hasDoc }) => ($hasDoc ? '' : 'height: 340px;')}
  overflow: hidden;
  cursor: ${({ $armed }) => ($armed ? 'crosshair' : 'default')};
  touch-action: pan-y;
`;
// Slice-D audit fix (section 5, MEDIUM): touch-action pan-y on the
// Canvas keeps vertical scroll working but suppresses pinch-zoom on
// the PDF backdrop. Pinch-zoom was scaling the canvas mid-drop and
// breaking the percent-coords math. FieldShell stays touch-action
// none so drags don't fight scroll.

const PdfBackdrop = styled.div`
  position: relative;
  z-index: 0;
  pointer-events: none;
`;

const PageTitle = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 14px;
  font-weight: 500;
`;

const PageLine = styled.div<{ $w: number }>`
  height: 4px;
  border-radius: 2px;
  background: var(--ink-150);
  margin: 5px 0;
  width: ${({ $w }) => $w}%;
`;

const Tray = styled.div`
  margin-top: 14px;
  padding: 12px 16px 6px;
  background: #fff;
  border-top: 0.5px solid var(--border-1);
`;

const TrayHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
`;

const TrayLabel = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: var(--fg-3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
`;

const CancelLink = styled.button`
  border: none;
  background: transparent;
  color: var(--fg-3);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const Chips = styled.div`
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
`;

/**
 * Slice-D §5 HIGH: chips were 38 px tall — below WCAG 2.5.5 (44×44).
 * The chip row is `overflow-x: auto`, so horizontal room isn't a
 * constraint; bumping padding gives the most-tapped element on this
 * screen a real touch target.
 */
const Chip = styled.button<{ $armed: boolean }>`
  flex-shrink: 0;
  padding: 12px 16px;
  min-height: 44px;
  border-radius: 12px;
  background: ${({ $armed }) => ($armed ? 'var(--indigo-600)' : 'var(--ink-100)')};
  color: ${({ $armed }) => ($armed ? '#fff' : 'var(--fg-1)')};
  border: 1px solid ${({ $armed }) => ($armed ? 'var(--indigo-700)' : 'transparent')};
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s;
  font: inherit;

  &:focus-visible {
    outline: 2px solid var(--indigo-700);
    outline-offset: 2px;
  }
`;

const FieldShell = styled.div<{ $selected: boolean; $dragging: boolean }>`
  position: absolute;
  cursor: ${({ $dragging, $selected }) =>
    $dragging ? 'grabbing' : $selected ? 'grab' : 'pointer'};
  z-index: ${({ $selected }) => ($selected ? 10 : 1)};
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  filter: ${({ $dragging }) =>
    $dragging ? 'drop-shadow(0 6px 16px rgba(11,18,32,0.18))' : 'none'};
`;

const FieldPill = styled.div<{ $color: string; $selected: boolean }>`
  flex: 1;
  height: 100%;
  border: ${({ $selected }) => ($selected ? '2px solid' : '1.5px dashed')} ${({ $color }) => $color};
  background: ${({ $color }) => `${$color}1A`};
  border-radius: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--fg-1);
  overflow: hidden;
`;

const DragHandle = styled.span`
  position: absolute;
  top: -3px;
  left: -3px;
  width: 14px;
  height: 14px;
  border-radius: 7px;
  background: #fff;
  border: 1.5px solid var(--indigo-600);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  color: var(--indigo-700);
`;

const LinkedBadge = styled.div`
  position: absolute;
  top: -9px;
  left: 6px;
  padding: 2px 6px;
  background: #fff;
  border: 1px solid var(--indigo-200);
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  color: var(--indigo-700);
  font-family: ${({ theme }) => theme.font.mono};
  display: inline-flex;
  align-items: center;
  gap: 3px;
`;

const Toolbar = styled.div`
  position: absolute;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--ink-900);
  color: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  font-size: 11px;
  font-weight: 600;
`;

const TbBtn = styled.button`
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  font: inherit;

  &:focus-visible {
    outline: 1px solid #fff;
    outline-offset: 2px;
  }
`;

/**
 * Slice-D §5 MEDIUM: dedicated delete variant of the toolbar button so
 * the soft-red colour lives in a styled rule, not an inline `#FCA5A5`
 * literal. Uses the danger token via `var(--danger-300, …)` with the
 * tailwind-equivalent hex as a fallback for callers that haven't
 * imported the SPA's `tokens.css` (Storybook stories etc.).
 */
const DeleteTbBtn = styled(TbBtn)`
  color: var(--danger-300, #fca5a5);
`;

const Empty = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--fg-4);
  padding: 0 16px;
`;

// QA-2026-05-02 (Bug 8): conservative pixel estimate of the field-action
// toolbar pill (label + Pages + Signers + Delete). Used to clamp the
// toolbar's `left` so it can't overflow past the canvas right edge.
const TOOLBAR_WIDTH_ESTIMATE = 250;
// Slice-D §5 HIGH: when a selected field's `y` is too close to the top,
// the toolbar (~42 px tall) was clamping to `top: 8` and overlapping
// the field. Below 50 px, we render the toolbar UNDER the field
// instead. Cached as a constant so the regression test can pin it.
const TOOLBAR_TOP_THRESHOLD_PX = 50;
const TOOLBAR_GAP_PX = 8;

function chipIcon(k: MobileFieldType, size = 14) {
  switch (k) {
    case 'sig':
      return <PenTool size={size} aria-hidden />;
    case 'ini':
      return <Type size={size} aria-hidden />;
    case 'dat':
      return <Calendar size={size} aria-hidden />;
    case 'txt':
      return <Square size={size} aria-hidden />;
    case 'chk':
      return <CheckSquare size={size} aria-hidden />;
    default:
      return null;
  }
}

export interface MWPlaceProps {
  readonly page: number;
  readonly totalPages: number;
  readonly onPage: (n: number) => void;
  /**
   * Loaded pdf.js document. When provided, the canvas backdrop is the
   * real PDF page (rasterized via PdfPageView). When `null` (initial
   * load / pre-pick), we keep the placeholder line bars — same fallback
   * the file step uses.
   */
  readonly doc?: PDFDocumentProxy | null;
  readonly fields: ReadonlyArray<MobilePlacedField>;
  readonly signers: ReadonlyArray<MobileSigner>;
  readonly selectedIds: ReadonlyArray<string>;
  readonly armedTool: MobileFieldType | null;
  readonly onArmTool: (t: MobileFieldType | null) => void;
  readonly onCanvasTap: (pos: { readonly x: number; readonly y: number }) => void;
  readonly onTapField: (id: string, replace: boolean) => void;
  readonly onClearSelection: () => void;
  readonly onOpenApply: (id: string) => void;
  readonly onOpenAssign: (id: string) => void;
  readonly onDeleteSelected: () => void;
  readonly onCommitDrag: (ids: ReadonlyArray<string>, dx: number, dy: number) => void;
  /** Called when the canvas has measured itself — surfaces the rendered
   *  canvas size so the parent can clamp drags accurately. */
  readonly onCanvasMeasured?: (size: { readonly width: number; readonly height: number }) => void;
}

interface DragState {
  fieldId: string;
  startX: number;
  startY: number;
  pointerId: number;
  moved: boolean;
  wasSelected: boolean;
}

export function MWPlace(props: MWPlaceProps) {
  const {
    page,
    totalPages,
    onPage,
    doc,
    fields,
    signers,
    selectedIds,
    armedTool,
    onArmTool,
    onCanvasTap,
    onTapField,
    onClearSelection,
    onOpenApply,
    onOpenAssign,
    onDeleteSelected,
    onCommitDrag,
    onCanvasMeasured,
  } = props;

  const visible = fieldsOnPage(fields, page);
  const dragRef = useRef<DragState | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  // QA-2026-05-02 (Bug 8): cache the canvas width so the field-action
  // toolbar can be clamped to the right edge — without this, the dark
  // pill (label + Pages + Signers + Delete) overflows past the canvas
  // and gets sliced by `overflow: hidden` whenever the user picks a
  // field near the right margin. Slice-D §5 HIGH adds the height read
  // for below-positioning clamping when the field sits near the top.
  const [canvasWidth, setCanvasWidth] = useState<number>(0);
  const [canvasHeight, setCanvasHeight] = useState<number>(0);

  // Notify the parent of the rendered canvas size so it can clamp drags,
  // and capture the width locally for the in-canvas toolbar clamp.
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const apply = (): void => {
      const measuredWidth = el.clientWidth;
      const measuredHeight = el.clientHeight;
      setCanvasWidth(measuredWidth);
      setCanvasHeight(measuredHeight);
      onCanvasMeasured?.({ width: measuredWidth, height: measuredHeight });
    };
    apply();
    if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
      const ro = new ResizeObserver(apply);
      ro.observe(el);
      return () => ro.disconnect();
    }
    return undefined;
  }, [onCanvasMeasured]);

  const onFieldPointerDown = (e: React.PointerEvent<HTMLDivElement>, fieldId: string): void => {
    if (armedTool) return;
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointer-capture is best-effort; jsdom doesn't implement it.
    }
    dragRef.current = {
      fieldId,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      moved: false,
      wasSelected: selectedIds.includes(fieldId),
    };
  };

  const onFieldPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const deltaX = e.clientX - drag.startX;
    const deltaY = e.clientY - drag.startY;
    if (
      !drag.moved &&
      (Math.abs(deltaX) > DRAG_THRESHOLD_PX || Math.abs(deltaY) > DRAG_THRESHOLD_PX)
    ) {
      drag.moved = true;
      setDragTargetId(drag.fieldId);
    }
    if (drag.moved) setDragOffset({ x: deltaX, y: deltaY });
  };

  const onFieldPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (drag.moved) {
      const deltaX = e.clientX - drag.startX;
      const deltaY = e.clientY - drag.startY;
      const ids = drag.wasSelected ? selectedIds : [drag.fieldId];
      onCommitDrag(ids, deltaX, deltaY);
      if (!drag.wasSelected) onTapField(drag.fieldId, true);
      setDragOffset({ x: 0, y: 0 });
      setDragTargetId(null);
    } else {
      onTapField(drag.fieldId, false);
    }
  };

  const dragTargetSelected = dragTargetId !== null && selectedIds.includes(dragTargetId);
  const isFieldDragging = (fid: string): boolean => {
    if (!dragTargetId) return false;
    if (fid === dragTargetId) return true;
    return dragTargetSelected && selectedIds.includes(fid);
  };

  const selectedSingle =
    selectedIds.length === 1 ? (visible.find((f) => f.id === selectedIds[0]) ?? null) : null;

  const armedDef = armedTool ? getFieldDef(armedTool) : null;

  return (
    <Section>
      <PageFilmstrip totalPages={totalPages} currentPage={page} onPage={onPage} fields={fields} />
      <HeadRow>
        <PageEyebrow>
          Page {page} of {totalPages}
        </PageEyebrow>
        {armedDef ? (
          <ArmedHint>
            {chipIcon(armedDef.k, 12)}
            Tap to drop · {armedDef.label}
          </ArmedHint>
        ) : (
          <SwipeHint>Tap a chip below, then tap the page</SwipeHint>
        )}
      </HeadRow>
      <CanvasWrap>
        <Canvas
          ref={canvasRef}
          $armed={Boolean(armedTool)}
          $hasDoc={Boolean(doc)}
          data-testid="mw-canvas"
          onClick={(e) => {
            if (armedTool) {
              const rect = e.currentTarget.getBoundingClientRect();
              onCanvasTap({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              });
            } else {
              onClearSelection();
            }
          }}
        >
          {doc && canvasWidth > 0 ? (
            <PdfBackdrop data-testid="mw-pdf-backdrop">
              <PdfPageView doc={doc} pageNumber={page} width={canvasWidth} />
            </PdfBackdrop>
          ) : (
            <>
              <PageTitle>Page {page}</PageTitle>
              <div style={{ height: 8 }} />
              {[60, 78, 66, 88, 71, 84, 62].map((w, i) => (
                <PageLine key={`ln-${i}-${w}`} $w={w} />
              ))}
            </>
          )}
          {visible.map((f) => {
            const def = getFieldDef(f.type);
            const sel = selectedIds.includes(f.id);
            const dragging = isFieldDragging(f.id);
            const ox = dragging ? dragOffset.x : 0;
            const oy = dragging ? dragOffset.y : 0;
            const signer = signers.find((s) => s.id === f.signerIds[0]);
            const color = signer?.color ?? 'var(--ink-400)';
            const linkedCount = (f.linkedPages.length > 0 ? f.linkedPages : [f.page]).length;
            return (
              <FieldShell
                key={f.id}
                $selected={sel}
                $dragging={dragging}
                role="button"
                aria-pressed={sel}
                aria-label={`${def.label} field${signer ? ` for ${signer.name}` : ''}`}
                tabIndex={0}
                style={{
                  left: f.x + ox,
                  top: f.y + oy,
                  width: def.w,
                  height: def.h,
                }}
                onPointerDown={(e) => onFieldPointerDown(e, f.id)}
                onPointerMove={onFieldPointerMove}
                onPointerUp={onFieldPointerUp}
                onPointerCancel={onFieldPointerUp}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onTapField(f.id, false);
                  } else if (e.key === 'Delete' || e.key === 'Backspace') {
                    if (sel) onDeleteSelected();
                  }
                }}
              >
                <FieldPill $color={color} $selected={sel}>
                  {chipIcon(f.type, 12)}
                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {signer ? `${signer.initials} · ${def.label}` : def.label}
                  </span>
                </FieldPill>
                {sel && (
                  <DragHandle aria-hidden>
                    <Move size={9} />
                  </DragHandle>
                )}
                {linkedCount > 1 && !sel && (
                  <LinkedBadge>
                    <Link2 size={10} aria-hidden />
                    {linkedCount}p
                  </LinkedBadge>
                )}
              </FieldShell>
            );
          })}
          {selectedSingle &&
            !dragTargetId &&
            (() => {
              const def = getFieldDef(selectedSingle.type);
              // Slice-D §5 HIGH: when the selected field is near the top
              // of the canvas (y < threshold), the toolbar can't fit
              // ABOVE without colliding with the field itself. Render it
              // below instead. When below, clamp top to keep the toolbar
              // inside the canvas.
              const aboveTop = selectedSingle.y - 50;
              const placeBelow = selectedSingle.y < TOOLBAR_TOP_THRESHOLD_PX;
              const belowTop = selectedSingle.y + def.h + TOOLBAR_GAP_PX;
              const computedTop = placeBelow
                ? canvasHeight > 0
                  ? Math.min(belowTop, Math.max(8, canvasHeight - 48))
                  : belowTop
                : Math.max(8, aboveTop);
              return (
                <Toolbar
                  data-testid="field-action-toolbar"
                  style={{
                    // QA-2026-05-02 (Bug 8): clamp to the right edge using
                    // the measured canvas width so the toolbar can't
                    // overflow and get clipped by `overflow: hidden` on
                    // the canvas. We use a conservative 250px estimate of
                    // the toolbar's pill width (label + Pages + Signers +
                    // Delete) and only clamp when the canvas has actually
                    // been measured.
                    left:
                      canvasWidth > 0
                        ? Math.min(
                            Math.max(8, canvasWidth - TOOLBAR_WIDTH_ESTIMATE - 8),
                            Math.max(8, selectedSingle.x - 6),
                          )
                        : Math.max(8, selectedSingle.x - 6),
                    top: computedTop,
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span style={{ opacity: 0.7, fontFamily: 'var(--font-mono)' }} aria-hidden>
                    {def.label}
                  </span>
                  <TbBtn
                    type="button"
                    onClick={() => onOpenApply(selectedSingle.id)}
                    aria-label="Pages"
                  >
                    <Copy size={13} aria-hidden /> Pages
                  </TbBtn>
                  <TbBtn
                    type="button"
                    onClick={() => onOpenAssign(selectedSingle.id)}
                    aria-label="Signers"
                  >
                    <Users size={13} aria-hidden /> Signers
                  </TbBtn>
                  {/* Slice-D §5 MEDIUM: was `style={{ color: '#FCA5A5' }}` — a
                       raw hex literal that violates the token-only rule.
                       Replaced with a dedicated styled `DeleteTbBtn` that
                       routes through `var(--danger-300, …)`. */}
                  <DeleteTbBtn type="button" onClick={onDeleteSelected} aria-label="Delete field">
                    <Trash2 size={13} aria-hidden />
                  </DeleteTbBtn>
                </Toolbar>
              );
            })()}
          {visible.length === 0 && !armedTool && (
            <Empty>Pick a field below, then tap on the page.</Empty>
          )}
        </Canvas>
      </CanvasWrap>
      <Tray>
        <TrayHead>
          <TrayLabel>Field tray</TrayLabel>
          {armedTool && (
            <CancelLink type="button" onClick={() => onArmTool(null)}>
              <XIcon size={12} aria-hidden /> Cancel
            </CancelLink>
          )}
        </TrayHead>
        <Chips role="toolbar" aria-label="Field types">
          {MOBILE_FIELD_DEFS.map((c) => {
            const armed = armedTool === c.k;
            return (
              <Chip
                key={c.k}
                type="button"
                $armed={armed}
                aria-pressed={armed}
                aria-label={`${c.label}${armed ? ' (armed — tap on page to drop)' : ''}`}
                onClick={() => onArmTool(armed ? null : c.k)}
              >
                {chipIcon(c.k)}
                {c.label}
              </Chip>
            );
          })}
        </Chips>
      </Tray>
    </Section>
  );
}
