import { forwardRef } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import { Calendar, CheckSquare, Mail, PenTool, Plus, TextCursorInput, Type } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { seald } from '@/styles/theme';
import { FIELD_KINDS } from '@/types/sealdTypes';
import type { FieldKind } from '@/types/sealdTypes';
import { Button } from '../Button';
import type { FieldsBarProps, FieldsBarSigner } from './FieldsBar.types';
import {
  AddSignerSlot,
  Aside,
  Divider,
  Eyebrow,
  SignerBadge,
  SignerEmail,
  SignerItem,
  SignerList,
  SignerName,
  SignerRow,
  SignerText,
  Subtitle,
  Tile,
  TileGrid,
  TileItem,
  Title,
} from './FieldsBar.styles';

const FIELD_META: Record<FieldKind, { readonly label: string; readonly icon: LucideIcon }> = {
  signature: { label: 'Signature', icon: PenTool },
  initials: { label: 'Initial', icon: Type },
  date: { label: 'Date', icon: Calendar },
  text: { label: 'Text', icon: TextCursorInput },
  checkbox: { label: 'Checkbox', icon: CheckSquare },
  email: { label: 'Email', icon: Mail },
};

function resolveTone(signer: FieldsBarSigner, index: number): 'indigo' | 'success' {
  if (signer.colorToken !== undefined) {
    return signer.colorToken;
  }
  return index === 0 ? 'indigo' : 'success';
}

export const FieldsBar = forwardRef<HTMLElement, FieldsBarProps>((props, ref) => {
  const {
    fieldKinds = FIELD_KINDS,
    onFieldDragStart,
    onFieldDragEnd,
    onFieldActivate,
    signers,
    onAddSigner,
    activeSignerId,
    onSelectSigner,
    title = 'Fields',
    subtitle = 'Drag onto the page for each signer.',
    ...rest
  } = props;

  const handleTileKeyDown =
    (kind: FieldKind) =>
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onFieldActivate?.(kind);
      }
    };

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

  const handleSignerClick = (id: string) => (): void => {
    onSelectSigner?.(id);
  };

  const handleSignerKeyDown =
    (id: string) =>
    (e: KeyboardEvent<HTMLDivElement>): void => {
      if (!onSelectSigner) {
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelectSigner(id);
      }
    };

  const signerInteractive = onSelectSigner !== undefined;

  return (
    <Aside {...rest} ref={ref} aria-label="Fields panel">
      <Title>{title}</Title>
      <Subtitle>{subtitle}</Subtitle>
      <TileGrid role="list">
        {fieldKinds.map((kind) => {
          const meta = FIELD_META[kind];
          const TileIcon = meta.icon;
          return (
            <TileItem key={kind}>
              <Tile
                draggable
                role="button"
                tabIndex={0}
                aria-label={`Drag ${meta.label} field onto the page`}
                onDragStart={handleDragStart(kind)}
                onDragEnd={handleDragEnd(kind)}
                onKeyDown={handleTileKeyDown(kind)}
              >
                <TileIcon
                  size={16}
                  strokeWidth={1.75}
                  color={seald.color.indigo[600]}
                  aria-hidden
                />
                {meta.label}
              </Tile>
            </TileItem>
          );
        })}
      </TileGrid>
      {signers !== undefined && signers.length > 0 ? (
        <>
          <Divider />
          <Eyebrow>Signers</Eyebrow>
          <SignerList>
            {signers.map((signer, index) => {
              const tone = resolveTone(signer, index);
              const isActive = activeSignerId === signer.id;
              return (
                <SignerItem key={signer.id}>
                  <SignerRow
                    $active={isActive}
                    $clickable={signerInteractive}
                    tabIndex={signerInteractive ? 0 : -1}
                    role={signerInteractive ? 'button' : undefined}
                    aria-pressed={signerInteractive ? isActive : undefined}
                    onClick={signerInteractive ? handleSignerClick(signer.id) : undefined}
                    onKeyDown={signerInteractive ? handleSignerKeyDown(signer.id) : undefined}
                  >
                    <SignerBadge $tone={tone} aria-hidden>
                      {index + 1}
                    </SignerBadge>
                    <SignerText>
                      <SignerName>{signer.name}</SignerName>
                      <SignerEmail>{signer.email}</SignerEmail>
                    </SignerText>
                  </SignerRow>
                </SignerItem>
              );
            })}
          </SignerList>
          {onAddSigner !== undefined ? (
            <AddSignerSlot>
              <Button variant="ghost" size="sm" iconLeft={Plus} onClick={onAddSigner}>
                Add signer
              </Button>
            </AddSignerSlot>
          ) : null}
        </>
      ) : null}
    </Aside>
  );
});

FieldsBar.displayName = 'FieldsBar';
