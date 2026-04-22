import { forwardRef, useMemo } from 'react';
import { Calendar, CheckSquare, Mail, PenTool, TextCursorInput, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { seald } from '../../styles/theme';
import type { FieldKind } from '../../types/sealdTypes';
import type {
  FieldsPlacedListItem,
  FieldsPlacedListProps,
  FieldsPlacedListSigner,
} from './FieldsPlacedList.types';
import {
  AvatarChip,
  AvatarStack,
  EmptyHint,
  Header,
  Item,
  Label,
  List,
  PageTag,
  Row,
  Section,
} from './FieldsPlacedList.styles';

const FIELD_META: Record<FieldKind, { readonly label: string; readonly icon: LucideIcon }> = {
  signature: { label: 'Signature', icon: PenTool },
  initials: { label: 'Initials', icon: Type },
  date: { label: 'Date', icon: Calendar },
  text: { label: 'Text', icon: TextCursorInput },
  checkbox: { label: 'Checkbox', icon: CheckSquare },
  email: { label: 'Email', icon: Mail },
};

const MAX_AVATARS = 3;
const DEFAULT_EMPTY_HINT = 'Drag a field from the left onto the page to get started.';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function buildAriaLabel(field: FieldsPlacedListItem, assignedNames: ReadonlyArray<string>): string {
  const meta = FIELD_META[field.type];
  const base = `${meta.label} on page ${field.page}`;
  if (assignedNames.length === 0) {
    return base;
  }
  return `${base} for ${assignedNames.join(', ')}`;
}

export const FieldsPlacedList = forwardRef<HTMLElement, FieldsPlacedListProps>((props, ref) => {
  const {
    fields,
    signers,
    selectedFieldId,
    onSelectField,
    title = 'Fields placed',
    emptyHint = DEFAULT_EMPTY_HINT,
    ...rest
  } = props;

  const signerMap = useMemo<ReadonlyMap<string, FieldsPlacedListSigner>>(() => {
    const map = new Map<string, FieldsPlacedListSigner>();
    signers.forEach((s) => map.set(s.id, s));
    return map;
  }, [signers]);

  const handleRowClick = (id: string) => (): void => {
    onSelectField?.(id);
  };

  const isEmpty = fields.length === 0;

  return (
    <Section {...rest} ref={ref} aria-label={title}>
      <Header>{title}</Header>
      {isEmpty ? (
        <EmptyHint role="status">{emptyHint}</EmptyHint>
      ) : (
        <List role="list">
          {fields.map((field) => {
            const meta = FIELD_META[field.type];
            const FieldIcon = meta.icon;
            const assigned = field.signerIds
              .map((id) => signerMap.get(id))
              .filter((s): s is FieldsPlacedListSigner => s !== undefined);
            const visible = assigned.slice(0, MAX_AVATARS);
            const assignedNames = assigned.map((s) => s.name);
            const isSelected = selectedFieldId === field.id;
            return (
              <Item key={field.id}>
                <Row
                  type="button"
                  $selected={isSelected}
                  aria-current={isSelected ? 'true' : undefined}
                  aria-label={buildAriaLabel(field, assignedNames)}
                  onClick={handleRowClick(field.id)}
                >
                  <FieldIcon
                    size={14}
                    strokeWidth={1.75}
                    color={seald.color.indigo[600]}
                    aria-hidden
                  />
                  <Label>{meta.label}</Label>
                  <PageTag>{`p${field.page}`}</PageTag>
                  <AvatarStack aria-hidden>
                    {visible.map((signer, i) => (
                      <AvatarChip key={signer.id} $color={signer.color} $first={i === 0}>
                        {getInitials(signer.name)}
                      </AvatarChip>
                    ))}
                  </AvatarStack>
                </Row>
              </Item>
            );
          })}
        </List>
      )}
    </Section>
  );
});

FieldsPlacedList.displayName = 'FieldsPlacedList';
