import { useLayoutEffect, useRef, useState } from 'react';
import styled from 'styled-components';
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

const Canvas = styled.div<{ $armed: boolean }>`
  background: #fff;
  box-shadow:
    0 1px 2px rgba(11, 18, 32, 0.06),
    0 12px 32px rgba(11, 18, 32, 0.08);
  border-radius: 8px;
  padding: 24px 22px;
  position: relative;
  height: 340px;
  overflow: hidden;
  cursor: ${({ $armed }) => ($armed ? 'crosshair' : 'default')};
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

const Chip = styled.button<{ $armed: boolean }>`
  flex-shrink: 0;
  padding: 10px 14px;
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
  min-height: 38px;

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

  // Notify the parent of the rendered canvas size so it can clamp drags.
  useLayoutEffect(() => {
    if (!onCanvasMeasured) return undefined;
    const el = canvasRef.current;
    if (!el) return undefined;
    const apply = (): void => {
      onCanvasMeasured({ width: el.clientWidth, height: el.clientHeight });
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
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      d.moved = true;
      setDragTargetId(d.fieldId);
    }
    if (d.moved) setDragOffset({ x: dx, y: dy });
  };

  const onFieldPointerUp = (e: React.PointerEvent<HTMLDivElement>): void => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (d.moved) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      const ids = d.wasSelected ? selectedIds : [d.fieldId];
      onCommitDrag(ids, dx, dy);
      if (!d.wasSelected) onTapField(d.fieldId, true);
      setDragOffset({ x: 0, y: 0 });
      setDragTargetId(null);
    } else {
      onTapField(d.fieldId, false);
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
          <PageTitle>Page {page}</PageTitle>
          <div style={{ height: 8 }} />
          {[60, 78, 66, 88, 71, 84, 62].map((w, i) => (
            <PageLine key={`ln-${i}-${w}`} $w={w} />
          ))}
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
          {selectedSingle && !dragTargetId && (
            <Toolbar
              data-testid="field-action-toolbar"
              style={{
                left: Math.max(8, selectedSingle.x - 6),
                top: Math.max(8, selectedSingle.y - 50),
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <span style={{ opacity: 0.7, fontFamily: 'var(--font-mono)' }} aria-hidden>
                {getFieldDef(selectedSingle.type).label}
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
              <TbBtn
                type="button"
                onClick={onDeleteSelected}
                style={{ color: '#FCA5A5' }}
                aria-label="Delete field"
              >
                <Trash2 size={13} aria-hidden />
              </TbBtn>
            </Toolbar>
          )}
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
