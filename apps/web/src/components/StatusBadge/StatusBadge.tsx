import {
  Ban,
  Check,
  Clock,
  FilePen,
  LoaderCircle,
  PenLine,
  ShieldCheck,
  TimerOff,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SignerStatus } from '@/types/sealdTypes';
import { Badge } from '../Badge';
import type { BadgeTone } from '../Badge';
import type { EnvelopeBadgeStatus, StatusBadgeProps } from './StatusBadge.types';

interface BadgeEntry {
  readonly tone: BadgeTone;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** Signer-level statuses (signer rows, signer lists). */
export const STATUS_BADGE_MAP: Readonly<Record<SignerStatus, BadgeEntry>> = Object.freeze({
  'awaiting-you': { tone: 'indigo', label: 'Awaiting you', icon: PenLine },
  'awaiting-others': { tone: 'amber', label: 'Awaiting others', icon: Clock },
  completed: { tone: 'emerald', label: 'Signed', icon: Check },
  declined: { tone: 'red', label: 'Declined', icon: XCircle },
  expired: { tone: 'red', label: 'Expired', icon: TimerOff },
  draft: { tone: 'neutral', label: 'Draft', icon: FilePen },
});

/** Envelope-level statuses (documents list, envelope header) — v2 copy. */
export const ENVELOPE_BADGE_MAP: Readonly<Record<EnvelopeBadgeStatus, BadgeEntry>> = Object.freeze({
  you: { tone: 'indigo', label: 'Your turn', icon: PenLine },
  others: { tone: 'amber', label: 'Waiting', icon: Clock },
  sealing: { tone: 'indigo', label: 'Sealing', icon: LoaderCircle },
  sealed: { tone: 'emerald', label: 'Sealed', icon: ShieldCheck },
  declined: { tone: 'red', label: 'Declined', icon: XCircle },
  expired: { tone: 'red', label: 'Expired', icon: TimerOff },
  canceled: { tone: 'neutral', label: 'Canceled', icon: Ban },
  draft: { tone: 'neutral', label: 'Draft', icon: FilePen },
});

function isEnvelopeStatus(status: string): status is EnvelopeBadgeStatus {
  return Object.prototype.hasOwnProperty.call(ENVELOPE_BADGE_MAP, status);
}

/** L2 — maps a signer or envelope status to its toned Badge with an icon. */
export function StatusBadge({ status, label }: StatusBadgeProps) {
  const entry = isEnvelopeStatus(status) ? ENVELOPE_BADGE_MAP[status] : STATUS_BADGE_MAP[status];
  return (
    <Badge tone={entry.tone} icon={entry.icon} data-status={status}>
      {label ?? entry.label}
    </Badge>
  );
}
