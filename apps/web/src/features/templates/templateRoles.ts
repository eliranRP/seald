import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import { seald } from '@/styles/theme';
import type { TemplateSummary } from './templates';

/**
 * One signer slot of a template. A template stores its layout per slot
 * (`signerRoleId` / `signerIndex` on each field) and the people who filled the
 * slots last time (`last_signers`); the Use dialog shows one row per slot with
 * that person already chosen.
 */
export interface TemplateRole {
  /**
   * Stable id of the slot: the stored signer id when the template has a
   * roster (it matches `signerRoleId` on the fields), else `slot-<n>`.
   */
  readonly key: string;
  /** "Signer 1", "Signer 2"... templates store people, not role names. */
  readonly label: string;
  /** Dot colour for the slot, from the signer palette. */
  readonly color: string;
  /** Who filled the slot last time; null when nobody is remembered. */
  readonly person: AddSignerContact | null;
}

export function roleColor(index: number): string {
  const palette = seald.color.signer;
  return palette[index % palette.length] ?? seald.color.indigo[400];
}

/**
 * Slots for a template saved without a roster: every ordinal from 0 up to the
 * highest `signerIndex` its fields use (ordinal binding needs no gaps), and at
 * least one.
 */
function slotIndexes(template: Pick<TemplateSummary, 'fields'>): number[] {
  let max = 0;
  for (const f of template.fields) {
    if (f.signerIndex !== undefined && f.signerIndex > max) max = f.signerIndex;
  }
  return Array.from({ length: max + 1 }, (_, i) => i);
}

/**
 * The signer slots of a template, in order. A saved roster wins; a template
 * without one gets a slot per signer index its fields use, and at least one.
 */
export function deriveTemplateRoles(
  template: Pick<TemplateSummary, 'lastSigners' | 'fields'>,
): ReadonlyArray<TemplateRole> {
  const saved = template.lastSigners ?? [];
  if (saved.length > 0) {
    return saved.map((s, i) => ({
      key: s.id,
      label: `Signer ${String(i + 1)}`,
      color: roleColor(i),
      person: { id: s.id, name: s.name, email: s.email, color: s.color },
    }));
  }
  return slotIndexes(template).map((slot, i) => ({
    key: `slot-${String(slot)}`,
    label: `Signer ${String(i + 1)}`,
    color: roleColor(i),
    person: null,
  }));
}
