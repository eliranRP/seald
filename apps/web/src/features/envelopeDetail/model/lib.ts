import type { BadgeTone } from '@/components/Badge/Badge.types';
import type { EnvelopeStatus, SignerUiStatus } from '@/features/envelopes';

export const STATUS_LABEL: Record<EnvelopeStatus, string> = {
  draft: 'Draft',
  awaiting_others: 'Awaiting others',
  sealing: 'Sealing',
  completed: 'Sealed',
  declined: 'Declined',
  expired: 'Expired',
  canceled: 'Canceled',
};

export const STATUS_TONE: Record<EnvelopeStatus, BadgeTone> = {
  draft: 'neutral',
  awaiting_others: 'amber',
  sealing: 'indigo',
  completed: 'emerald',
  declined: 'red',
  expired: 'red',
  canceled: 'neutral',
};

export const SIGNER_STATUS_LABEL: Record<SignerUiStatus, string> = {
  awaiting: 'Waiting',
  viewing: 'Viewing',
  completed: 'Signed',
  declined: 'Declined',
};

export const SIGNER_STATUS_TONE: Record<SignerUiStatus, BadgeTone> = {
  awaiting: 'amber',
  viewing: 'indigo',
  completed: 'emerald',
  declined: 'red',
};

export const TERMINAL_STATUSES: ReadonlySet<EnvelopeStatus> = new Set([
  'completed',
  'declined',
  'expired',
  'canceled',
]);

export function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}
