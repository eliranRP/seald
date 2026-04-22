import { forwardRef, useCallback, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import {
  Asterisk,
  Calendar,
  CheckSquare,
  ChevronDown,
  Copy,
  Mail,
  PenTool,
  TextCursorInput,
  Type,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { seald } from '../../styles/theme';
import type { FieldKind } from '../../types/sealdTypes';
import type { PlacedFieldProps, PlacedFieldSigner, PlacedFieldValue } from './PlacedField.types';
import {
  AssignBubble,
  ControlButton,
  ControlsRight,
  GroupOverlay,
  Halo,
  InitialsBadge,
  RequiredBadge,
  RequiredToggle,
  ResizeHandle,
  Root,
  Tile,
  TileEyebrow,
  TileHeader,
  TileHeaderLabel,
  TileRow,
} from './PlacedField.styles';

const TILE_WIDTH = 132;
const TILE_HEIGHT = 54;
const TILE_GAP = 8;
const DEFAULT_MIN_WIDTH = 80;
const DEFAULT_MIN_HEIGHT = 36;
/** Pointer movement (in pixels) required before a mousedown is treated as a drag. */
const DRAG_THRESHOLD = 3;

const FIELD_META: Record<FieldKind, { readonly label: string; readonly icon: LucideIcon }> = {
  signature: { label: 'Signature', icon: PenTool },
  initials: { label: 'Initials', icon: Type },
  date: { label: 'Date', icon: Calendar },
  text: { label: 'Text', icon: TextCursorInput },
  checkbox: { label: 'Checkbox', icon: CheckSquare },
  email: { label: 'Email', icon: Mail },
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function resolveAssigned(
  field: PlacedFieldValue,
  signers: ReadonlyArray<PlacedFieldSigner>,
): ReadonlyArray<PlacedFieldSigner> {
  const result: PlacedFieldSigner[] = [];
  for (const id of field.signerIds) {
    const match = signers.find((s) => s.id === id);
    if (match !== undefined) {
      result.push(match);
    }
  }
  return result;
}

export const PlacedField = forwardRef<HTMLDivElement, PlacedFieldProps>((props, ref) => {
  const {
    field,
    signers,
    selected = false,
    inGroup = false,
    isDragging = false,
    canvasRef,
    onSelect,
    onOpenSignerPopover,
    onOpenPagesPopover,
    onRemove,
    onToggleRequired,
    onMove,
    onResize,
    minWidth = DEFAULT_MIN_WIDTH,
    minHeight = DEFAULT_MIN_HEIGHT,
    onDragStart,
    onDragEnd,
    ...rest
  } = props;

  const suppressNextClickRef = useRef<boolean>(false);

  const assigned = resolveAssigned(field, signers);
  const multi = assigned.length > 1;
  const naturalWidth = multi ? TILE_WIDTH * 2 + TILE_GAP : TILE_WIDTH;
  const totalWidth = field.width ?? naturalWidth;
  const totalHeight = field.height ?? TILE_HEIGHT;
  const required = field.required ?? true;
  const meta = FIELD_META[field.type];
  const FieldIcon = meta.icon;

  const ariaLabel =
    assigned.length > 0
      ? `${meta.label} field for ${assigned.map((s) => s.name).join(', ')}`
      : `${meta.label} field`;

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      const target = e.target as HTMLElement;
      if (target.closest('button') !== null) {
        return;
      }
      if (e.button !== 0) {
        return;
      }
      e.stopPropagation();

      // If this field is part of a multi-selection, defer the selection change
      // until we know whether this was a click (→ isolate to single) or a drag
      // (→ keep the group so every member can move together). Otherwise select
      // immediately so single-click selection stays responsive.
      const isGroupMember = selected && inGroup;
      if (!isGroupMember) {
        onSelect?.(e);
      }

      onDragStart?.();
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = field.x;
      const origY = field.y;
      let didDrag = false;
      const rect =
        canvasRef !== undefined && canvasRef.current !== null
          ? canvasRef.current.getBoundingClientRect()
          : null;

      const onWindowMove = (ev: MouseEvent): void => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!didDrag && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
          didDrag = true;
        }
        if (!didDrag) {
          return;
        }
        let nx = origX + dx;
        let ny = origY + dy;
        if (rect !== null && rect.width > 0 && rect.height > 0) {
          nx = Math.max(0, Math.min(nx, rect.width - totalWidth));
          ny = Math.max(0, Math.min(ny, rect.height - totalHeight));
        } else {
          nx = Math.max(0, nx);
          ny = Math.max(0, ny);
        }
        onMove?.(field.id, nx, ny);
      };

      const onWindowUp = (): void => {
        window.removeEventListener('mousemove', onWindowMove);
        window.removeEventListener('mouseup', onWindowUp);
        onDragEnd?.();
        // Group member that wasn't dragged → treat as a click and isolate it
        // to a single selection. A real drag skips this branch so the group
        // stays intact after moving.
        if (isGroupMember && !didDrag) {
          suppressNextClickRef.current = false;
          onSelect?.(e);
          return;
        }
        // Any successful drag suppresses the trailing click event the browser
        // fires on the underlying element — otherwise the click handler below
        // would re-fire onSelect and collapse a just-dragged group.
        if (didDrag) {
          suppressNextClickRef.current = true;
        }
      };

      window.addEventListener('mousemove', onWindowMove);
      window.addEventListener('mouseup', onWindowUp);
    },
    [
      canvasRef,
      field.id,
      field.x,
      field.y,
      inGroup,
      onDragEnd,
      onDragStart,
      onMove,
      onSelect,
      selected,
      totalHeight,
      totalWidth,
    ],
  );

  const startResize = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>, corner: 'nw' | 'ne' | 'sw' | 'se'): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.button !== 0) {
        return;
      }
      const startClientX = e.clientX;
      const startClientY = e.clientY;
      const origX = field.x;
      const origY = field.y;
      const origW = totalWidth;
      const origH = totalHeight;
      const rect =
        canvasRef !== undefined && canvasRef.current !== null
          ? canvasRef.current.getBoundingClientRect()
          : null;

      const onWindowMove = (ev: MouseEvent): void => {
        const dx = ev.clientX - startClientX;
        const dy = ev.clientY - startClientY;
        let nx = origX;
        let ny = origY;
        let nw = origW;
        let nh = origH;
        if (corner === 'nw') {
          nx = origX + dx;
          ny = origY + dy;
          nw = origW - dx;
          nh = origH - dy;
        } else if (corner === 'ne') {
          ny = origY + dy;
          nw = origW + dx;
          nh = origH - dy;
        } else if (corner === 'sw') {
          nx = origX + dx;
          nw = origW - dx;
          nh = origH + dy;
        } else {
          nw = origW + dx;
          nh = origH + dy;
        }
        if (nw < minWidth) {
          if (corner === 'nw' || corner === 'sw') {
            nx = origX + (origW - minWidth);
          }
          nw = minWidth;
        }
        if (nh < minHeight) {
          if (corner === 'nw' || corner === 'ne') {
            ny = origY + (origH - minHeight);
          }
          nh = minHeight;
        }
        if (rect !== null && rect.width > 0 && rect.height > 0) {
          if (nx < 0) {
            nw += nx;
            nx = 0;
          }
          if (ny < 0) {
            nh += ny;
            ny = 0;
          }
          if (nx + nw > rect.width) {
            nw = rect.width - nx;
          }
          if (ny + nh > rect.height) {
            nh = rect.height - ny;
          }
        }
        onResize?.(field.id, nx, ny, nw, nh);
      };

      const onWindowUp = (): void => {
        window.removeEventListener('mousemove', onWindowMove);
        window.removeEventListener('mouseup', onWindowUp);
        onDragEnd?.();
      };

      onDragStart?.();
      window.addEventListener('mousemove', onWindowMove);
      window.addEventListener('mouseup', onWindowUp);
    },
    [
      canvasRef,
      field.id,
      field.x,
      field.y,
      minHeight,
      minWidth,
      onDragEnd,
      onDragStart,
      onResize,
      totalHeight,
      totalWidth,
    ],
  );

  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      e.stopPropagation();
      // A completed drag suppresses the trailing click so the drag's grouped
      // selection isn't collapsed by a late-firing click handler.
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        return;
      }
      onSelect?.(e);
    },
    [onSelect],
  );

  const handleDuplicate = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>): void => {
      e.stopPropagation();
      onOpenPagesPopover?.(e);
    },
    [onOpenPagesPopover],
  );

  const handleDelete = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>): void => {
      e.stopPropagation();
      onRemove?.();
    },
    [onRemove],
  );

  const handleOpenSigners = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>): void => {
      e.stopPropagation();
      onOpenSignerPopover?.(e);
    },
    [onOpenSignerPopover],
  );

  const handleToggleRequired = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>): void => {
      e.stopPropagation();
      onToggleRequired?.(field.id, !required);
    },
    [field.id, onToggleRequired, required],
  );

  const tileSigners: ReadonlyArray<PlacedFieldSigner | null> = multi
    ? assigned
    : [assigned[0] ?? null];

  let selectionOrnaments: ReactNode = null;
  if (selected && !inGroup) {
    selectionOrnaments = (
      <>
        <AssignBubble type="button" aria-label="Assign signers" onClick={handleOpenSigners}>
          <Users size={12} strokeWidth={1.75} aria-hidden />
          Assign signers
          <ChevronDown size={12} strokeWidth={1.75} aria-hidden />
        </AssignBubble>
        <ControlsRight>
          <RequiredToggle
            type="button"
            $on={required}
            aria-label={required ? 'Mark field optional' : 'Mark field required'}
            aria-pressed={required}
            onClick={handleToggleRequired}
          >
            <Asterisk size={12} strokeWidth={2.25} aria-hidden />
          </RequiredToggle>
          <ControlButton
            type="button"
            $tone="indigo"
            aria-label="Duplicate field to pages"
            onClick={handleDuplicate}
          >
            <Copy size={12} strokeWidth={1.75} aria-hidden />
          </ControlButton>
          <ControlButton
            type="button"
            $tone="danger"
            aria-label="Delete field"
            onClick={handleDelete}
          >
            <X size={12} strokeWidth={1.75} aria-hidden />
          </ControlButton>
        </ControlsRight>
        <Halo aria-hidden />
        <ResizeHandle
          type="button"
          $top="start"
          $left="start"
          aria-label="Resize top-left"
          onMouseDown={(e) => startResize(e, 'nw')}
        />
        <ResizeHandle
          type="button"
          $top="start"
          $left="end"
          aria-label="Resize top-right"
          onMouseDown={(e) => startResize(e, 'ne')}
        />
        <ResizeHandle
          type="button"
          $top="end"
          $left="start"
          aria-label="Resize bottom-left"
          onMouseDown={(e) => startResize(e, 'sw')}
        />
        <ResizeHandle
          type="button"
          $top="end"
          $left="end"
          aria-label="Resize bottom-right"
          onMouseDown={(e) => startResize(e, 'se')}
        />
      </>
    );
  }

  let groupOrnament: ReactNode = null;
  if (inGroup) {
    groupOrnament = <GroupOverlay aria-hidden />;
  }

  return (
    <Root
      {...rest}
      ref={ref}
      role="group"
      aria-label={ariaLabel}
      $x={field.x}
      $y={field.y}
      $width={totalWidth}
      $height={totalHeight}
      $selected={selected}
      $isDragging={isDragging}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {selectionOrnaments}
      {groupOrnament}
      {required ? (
        <RequiredBadge aria-label="Required field" title="Required">
          *
        </RequiredBadge>
      ) : null}
      <TileRow>
        {tileSigners.map((s, index) => {
          const bg = s !== null ? `${s.color}2A` : seald.color.indigo[50];
          const border = s !== null ? s.color : seald.color.indigo[400];
          const iconColor = s !== null ? s.color : seald.color.indigo[600];
          const key = s !== null ? s.id : `empty-${String(index)}`;
          return (
            <Tile key={key} $bg={bg} $border={border}>
              <TileHeader>
                <FieldIcon size={12} strokeWidth={1.75} color={iconColor} aria-hidden />
                <TileHeaderLabel>{meta.label}</TileHeaderLabel>
              </TileHeader>
              <TileEyebrow>SIGN ID (UUID)</TileEyebrow>
              {s !== null ? (
                <InitialsBadge $color={s.color} aria-hidden>
                  {getInitials(s.name)}
                </InitialsBadge>
              ) : null}
            </Tile>
          );
        })}
      </TileRow>
    </Root>
  );
});

PlacedField.displayName = 'PlacedField';
