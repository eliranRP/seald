import { forwardRef } from 'react';
import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import {
  Calendar,
  CheckSquare,
  GripVertical,
  Mail,
  PenTool,
  TextCursorInput,
  Type,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { seald } from '@/styles/theme';
import { FIELD_KINDS } from '@/types/sealdTypes';
import type { FieldKind } from '@/types/sealdTypes';
import type { FieldPaletteProps } from './FieldPalette.types';
import {
  HintCard,
  Root,
  Row,
  RowLabel,
  SectionHeaderNext,
  SectionHeaderTop,
  UsageBadge,
} from './FieldPalette.styles';

const FIELD_META: Record<FieldKind, { readonly label: string; readonly icon: LucideIcon }> = {
  signature: { label: 'Signature', icon: PenTool },
  initials: { label: 'Initials', icon: Type },
  date: { label: 'Date', icon: Calendar },
  text: { label: 'Text', icon: TextCursorInput },
  checkbox: { label: 'Checkbox', icon: CheckSquare },
  email: { label: 'Email', icon: Mail },
};

const DEFAULT_REQUIRED: ReadonlyArray<FieldKind> = ['signature', 'initials'];
const DEFAULT_HINT = "Drag a field onto the page. You'll pick which signers fill it.";

export const FieldPalette = forwardRef<HTMLDivElement, FieldPaletteProps>((props, ref) => {
  const {
    kinds = FIELD_KINDS,
    requiredKinds = DEFAULT_REQUIRED,
    onFieldDragStart,
    onFieldDragEnd,
    onFieldActivate,
    hint,
    usageByKind,
    ...rest
  } = props;

  const requiredSet = new Set<FieldKind>(requiredKinds);
  const requiredList = kinds.filter((k) => requiredSet.has(k));
  const optionalList = kinds.filter((k) => !requiredSet.has(k));

  const handleDragStart =
    (kind: FieldKind) =>
    (e: DragEvent<HTMLDivElement>): void => {
      onFieldDragStart?.(kind, e);
    };

  const handleDragEnd =
    (kind: FieldKind) =>
    (e: DragEvent<HTMLDivElement>): void => {
      onFieldDragEnd?.(kind, e);
    };

  const handleKeyDown =
    (kind: FieldKind) =>
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onFieldActivate?.(kind);
      }
    };

  const renderRow = (kind: FieldKind): ReactNode => {
    const meta = FIELD_META[kind];
    const RowIcon = meta.icon;
    const usage = usageByKind?.[kind] ?? 0;
    return (
      <Row
        key={kind}
        role="button"
        tabIndex={0}
        draggable
        aria-label={meta.label}
        onDragStart={handleDragStart(kind)}
        onDragEnd={handleDragEnd(kind)}
        onKeyDown={handleKeyDown(kind)}
      >
        <RowIcon size={16} strokeWidth={1.75} color={seald.color.indigo[600]} aria-hidden />
        <RowLabel>{meta.label}</RowLabel>
        {usage > 0 ? (
          <UsageBadge
            aria-label={`${String(usage)} ${meta.label} field${usage === 1 ? '' : 's'} placed in document`}
          >
            {`×${String(usage)}`}
          </UsageBadge>
        ) : null}
        <GripVertical size={16} strokeWidth={1.75} color={seald.color.fg[4]} aria-hidden />
      </Row>
    );
  };

  const hintNode: ReactNode = hint ?? <HintCard>{DEFAULT_HINT}</HintCard>;

  return (
    <Root {...rest} ref={ref} role="region" aria-label="Field palette">
      {requiredList.length > 0 ? (
        <>
          <SectionHeaderTop>Required fields</SectionHeaderTop>
          {requiredList.map(renderRow)}
        </>
      ) : null}
      {optionalList.length > 0 ? (
        <>
          <SectionHeaderNext>Optional fields</SectionHeaderNext>
          {optionalList.map(renderRow)}
        </>
      ) : null}
      {hintNode}
    </Root>
  );
});

FieldPalette.displayName = 'FieldPalette';
