import { AlertTriangle, Ban, Clock, ShieldCheck, TimerOff, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { VerifyEvent, VerifyResponse, VerifySigner } from '@/features/verify';
import type { VerdictTone } from './VerifyPage.styles';

export interface VerdictChip {
  readonly label: string;
  readonly state: 'ok' | 'bad' | 'off';
}

export interface VerdictModel {
  readonly word: 'Authentic' | 'In progress' | 'Not sealed' | 'Tampered';
  readonly tone: VerdictTone;
  readonly icon: LucideIcon;
  readonly meta: string;
  readonly chips: ReadonlyArray<VerdictChip>;
  /** A sealed PDF exists, so it can be compared and its hashes shown. */
  readonly sealed: boolean;
  readonly tampered: boolean;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Oct 23, 2026 15:42:07 UTC" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const time = new Date(iso).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  });
  return `${formatDate(iso)} ${time} UTC`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function eventDate(events: ReadonlyArray<VerifyEvent>, type: VerifyEvent['event_type']): string {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (ev?.event_type === type) return formatDate(ev.created_at);
  }
  return '';
}

function withDate(text: string, date: string): string {
  return date ? `${text} · ${date}` : text;
}

function declinedBy(signers: ReadonlyArray<VerifySigner>): VerifySigner | undefined {
  return signers.find((s) => s.status === 'declined');
}

export function deriveVerdict(data: VerifyResponse): VerdictModel {
  const { envelope, signers, events, chain_intact: intact } = data;
  const done = signers.filter((s) => s.status === 'completed').length;
  const chain: VerdictChip = intact
    ? { label: 'Audit chain intact', state: 'ok' }
    : { label: 'Audit chain broken', state: 'bad' };

  if (envelope.status === 'completed') {
    const sealedOn = formatDate(envelope.sealed_at ?? envelope.completed_at);
    const signed = `${done} of ${signers.length} signed`;
    return {
      word: intact ? 'Authentic' : 'Tampered',
      tone: intact ? 'ok' : 'bad',
      icon: intact ? ShieldCheck : AlertTriangle,
      meta: intact
        ? withDate(signed, sealedOn ? `Sealed ${sealedOn}` : '')
        : 'The audit trail was changed after sealing.',
      chips: [
        { label: 'Unchanged since seal', state: 'ok' },
        chain,
        { label: 'PAdES B-LT', state: 'ok' },
        { label: 'Timestamped', state: 'ok' },
      ],
      sealed: true,
      tampered: !intact,
    };
  }

  const base = { sealed: false, tampered: !intact } as const;
  const notSealed = (icon: LucideIcon, meta: string, chip: VerdictChip): VerdictModel => ({
    word: 'Not sealed',
    tone: 'off',
    icon,
    meta,
    chips: [chip, chain],
    ...base,
  });

  if (envelope.status === 'declined') {
    const who = declinedBy(signers);
    const date = who?.declined_at ? formatDate(who.declined_at) : eventDate(events, 'declined');
    return notSealed(
      XCircle,
      withDate(who ? `Declined by ${firstName(who.name)}` : 'Declined', date),
      { label: 'Declined', state: 'off' },
    );
  }
  if (envelope.status === 'expired') {
    return notSealed(TimerOff, `Expired ${formatDate(envelope.expires_at)}`.trim(), {
      label: 'Expired',
      state: 'off',
    });
  }
  if (envelope.status === 'canceled') {
    return notSealed(Ban, withDate('Withdrawn by sender', eventDate(events, 'canceled')), {
      label: 'Withdrawn',
      state: 'off',
    });
  }

  const waiting = signers.find((s) => s.status !== 'completed');
  return {
    word: 'In progress',
    tone: 'warn',
    icon: Clock,
    meta: `${done} of ${signers.length} signed · not sealed yet`,
    chips: [
      {
        label: waiting ? `Waiting on ${firstName(waiting.name)}` : 'Sealing',
        state: 'off',
      },
      chain,
    ],
    ...base,
  };
}
