import { Badge } from '../Badge';
import type { BadgeTone } from '../Badge';
import type { SignerStatus } from '../../types/sealdTypes';
import type { StatusBadgeProps } from './StatusBadge.types';

export const STATUS_BADGE_MAP: Readonly<
  Record<SignerStatus, { readonly tone: BadgeTone; readonly label: string }>
> = Object.freeze({
  'awaiting-you': { tone: 'indigo', label: 'Awaiting you' },
  'awaiting-others': { tone: 'amber', label: 'Awaiting others' },
  completed: { tone: 'emerald', label: 'Completed' },
  declined: { tone: 'red', label: 'Declined' },
  expired: { tone: 'red', label: 'Expired' },
  draft: { tone: 'neutral', label: 'Draft' },
});

export function StatusBadge({ status }: StatusBadgeProps) {
  const entry = STATUS_BADGE_MAP[status];
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
