import {
  ArrowRight,
  Bell,
  Download,
  Pencil,
  PenLine,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react';
import type { EnvelopeListItem } from 'shared';
import type { RowStatus } from '@/features/dashboard';

export interface PrimaryAction {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly variant: 'primary' | 'secondary';
}

/** One primary action per row, chosen by status (design handoff). */
export const PRIMARY_ACTION: Readonly<Record<RowStatus, PrimaryAction>> = {
  you: { label: 'Sign', icon: PenLine, variant: 'primary' },
  others: { label: 'Remind', icon: Bell, variant: 'secondary' },
  sealing: { label: 'Open', icon: ArrowRight, variant: 'secondary' },
  sealed: { label: 'Download', icon: Download, variant: 'secondary' },
  declined: { label: 'Revise', icon: Pencil, variant: 'secondary' },
  expired: { label: 'Resend', icon: RefreshCw, variant: 'secondary' },
  canceled: { label: 'Revise', icon: Pencil, variant: 'secondary' },
  draft: { label: 'Continue', icon: ArrowRight, variant: 'secondary' },
};

/**
 * The one status color a row may carry: indigo when it is your move, green
 * when it is done, red when it stopped on a problem. Everything else is grey,
 * so the eye lands only on what needs attention.
 */
export type StatusTone = 'accent' | 'success' | 'danger' | 'neutral';

export const STATUS_TONE: Readonly<Record<RowStatus, StatusTone>> = {
  you: 'accent',
  others: 'neutral',
  sealing: 'neutral',
  sealed: 'success',
  declined: 'danger',
  expired: 'danger',
  canceled: 'neutral',
  draft: 'neutral',
};

/** A row's status as one short sentence, built on `statusReason`. */
export function statusLine(status: RowStatus, reason: string): string {
  switch (status) {
    case 'you':
      return 'Your turn to sign';
    case 'others':
      return reason === 'Waiting' ? 'Waiting for signers' : `Waiting for ${reason}`;
    case 'sealing':
      return 'Sealing';
    case 'sealed':
      return `Sealed ${reason}`;
    case 'declined':
      return reason === 'Declined' ? 'Declined' : `Declined by ${reason}`;
    case 'expired':
      return `Expired ${reason}`;
    case 'canceled':
      return `Canceled ${reason}`;
    case 'draft':
      return 'Draft, not sent';
  }
}

/** "1 of 2 signed", or null when the envelope has no signers yet. */
export function signedSummary(env: EnvelopeListItem): string | null {
  const total = env.signers.length;
  if (total === 0) return null;
  const done = env.signers.filter((s) => s.status === 'completed').length;
  return `${done} of ${total} signed`;
}
