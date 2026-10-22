import type { LucideIcon } from 'lucide-react';
import { Calendar, CheckSquare, Mail, PenTool, TextCursorInput, Type } from 'lucide-react';
import type { FieldKind } from '@/types/sealdTypes';
import type { FieldTileProps } from './FieldTile.types';
import { KindLabel, Owner, RequiredMark, Root } from './FieldTile.styles';

const FIELD_META: Record<FieldKind, { readonly label: string; readonly icon: LucideIcon }> = {
  signature: { label: 'Signature', icon: PenTool },
  initials: { label: 'Initials', icon: Type },
  date: { label: 'Date', icon: Calendar },
  text: { label: 'Text', icon: TextCursorInput },
  checkbox: { label: 'Checkbox', icon: CheckSquare },
  email: { label: 'Email', icon: Mail },
};

/**
 * Read-only tile for one placed field. The accessible name carries the
 * kind, the owner and the required flag, so a screen reader gets the same
 * summary a sighted user reads. It is a group, not a button, because it
 * has no action.
 */
export function FieldTile({ kind, signer, required = true }: FieldTileProps) {
  const meta = FIELD_META[kind];
  const Icon = meta.icon;
  const requiredText = required ? 'required' : 'optional';
  const accessibleName =
    signer !== undefined
      ? `${meta.label} field for ${signer.name}, ${requiredText}`
      : `${meta.label} field, unassigned, ${requiredText}`;

  return (
    <Root role="group" aria-label={accessibleName} $color={signer?.color ?? null}>
      <KindLabel>
        <Icon width={13} height={13} strokeWidth={1.75} aria-hidden />
        {meta.label}
      </KindLabel>
      <Owner $muted={signer === undefined}>{signer?.name ?? 'Unassigned'}</Owner>
      {required ? <RequiredMark aria-hidden>*</RequiredMark> : null}
    </Root>
  );
}
