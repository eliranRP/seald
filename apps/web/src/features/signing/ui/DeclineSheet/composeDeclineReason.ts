import type { DeclineChip } from './DeclineSheet.types';

/** The sender-facing label of each chip. Fixed English: the sender reads it, not the signer. */
export const DECLINE_CHIP_LABEL: Record<DeclineChip, string> = {
  wrong_person: 'Wrong person',
  terms: 'Terms',
  other: 'Other',
};

/** `"<chip>: <note>"`, either part alone, or undefined when both are empty. */
export function composeDeclineReason(chip: DeclineChip | null, note: string): string | undefined {
  const label = chip === null ? '' : DECLINE_CHIP_LABEL[chip];
  const text = note.trim();
  if (label && text) return `${label}: ${text}`.slice(0, 500);
  const only = label || text;
  return only ? only.slice(0, 500) : undefined;
}
