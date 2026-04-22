import { forwardRef, useCallback } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import {
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
import type {
  PlacedFieldProps,
  PlacedFieldSigner,
  PlacedFieldValue,
} from './PlacedField.types';
import {
  AssignBubble,
  ControlButton,
  ControlsRight,
  GroupOverlay,
  Halo,
  InitialsBadge,
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
    onMove,
    onDragStart,
    onDragEnd,
    ...rest
  } = props;

  const assigned = resolveAssigned(field, signers);
  const multi = assigned.length > 1;
  const totalWidth = multi ? TILE_WIDTH * 2 + TILE_GAP : TILE_WIDTH;
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
      onSelect?.(e);
      onDragStart?.();
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = field.x;
      const origY = field.y;
      const rect =
        canvasRef !== undefined && canvasRef.current !== null
          ? canvasRef.current.getBoundingClientRect()
          : null;

      const onWindowMove = (ev: MouseEvent): void => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let nx = origX + dx;
        let ny = origY + dy;
        if (rect !== null) {
          nx = Math.max(0, Math.min(nx, rect.width - totalWidth));
          ny = Math.max(0, Math.min(ny, rect.height - TILE_HEIGHT));
        }
        onMove?.(field.id, nx, ny);
      };

      const onWindowUp = (): void => {
        window.removeEventListener('mousemove', onWindowMove);
        window.removeEventListener('mouseup', onWindowUp);
        onDragEnd?.();
      };

      window.addEventListener('mousemove', onWindowMove);
      window.addEventListener('mouseup', onWindowUp);
    },
    [canvasRef, field.id, field.x, field.y, onDragEnd, onDragStart, onMove, onSelect, totalWidth],
  );

  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      e.stopPropagation();
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
        <ResizeHandle $top="start" $left="start" aria-hidden />
        <ResizeHandle $top="start" $left="end" aria-hidden />
        <ResizeHandle $top="end" $left="start" aria-hidden />
        <ResizeHandle $top="end" $left="end" aria-hidden />
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
      $height={TILE_HEIGHT}
      $selected={selected}
      $isDragging={isDragging}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {selectionOrnaments}
      {groupOrnament}
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
