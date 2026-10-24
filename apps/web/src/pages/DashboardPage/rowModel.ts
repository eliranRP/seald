import {
  ArrowRight,
  Ban,
  Bell,
  Clock,
  Download,
  FilePen,
  LoaderCircle,
  Pencil,
  PenLine,
  RefreshCw,
  ShieldCheck,
  TimerOff,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { EnvelopeListItem } from 'shared';
import type { SignerStackEntry, SignerStackStatus } from '@/components/SignerStack';
import type { RowStatus } from '@/features/dashboard';
import { isViewerSigner } from '@/features/dashboard';

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

export const STATUS_META_ICON: Readonly<Record<RowStatus, LucideIcon>> = {
  you: PenLine,
  others: Clock,
  sealing: LoaderCircle,
  sealed: ShieldCheck,
  declined: XCircle,
  expired: TimerOff,
  canceled: Ban,
  draft: FilePen,
};

type Signer = EnvelopeListItem['signers'][number];

export function stackStatus(
  env: EnvelopeListItem,
  signer: Signer,
  viewerEmail: string | null,
): SignerStackStatus {
  if (signer.status === 'completed') return 'signed';
  if (signer.status === 'declined') return 'declined';
  if (env.status === 'draft') return 'draft';
  if (isViewerSigner(signer, viewerEmail)) return 'awaiting-you';
  return 'pending';
}

export function stackEntries(
  env: EnvelopeListItem,
  viewerEmail: string | null,
): ReadonlyArray<SignerStackEntry> {
  return env.signers.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    status: stackStatus(env, s, viewerEmail),
  }));
}
