import {
  Ban,
  Bell,
  Clock,
  Eye,
  FilePlus,
  PenLine,
  PencilRuler,
  Send,
  ShieldCheck,
  UserRoundCog,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { isFeatureEnabled } from 'shared';
import type { MiniTrackStep } from '@/components/MiniTrack';
import { stepStartedText } from '@/features/signers/signingOrder/stepStartedText';
import { formatShortDate } from '@/lib/dateFormat';
import type { Envelope, EnvelopeEvent, EnvelopeSigner, EnvelopeStatus } from '@/features/envelopes';

export const TERMINAL_STATUSES: ReadonlySet<EnvelopeStatus> = new Set([
  'completed',
  'declined',
  'expired',
  'canceled',
]);

/** "2h", "5d", "now": the short relative form used in signer rows. */
export function relativeShort(iso: string | null, now: Date = new Date()): string {
  if (iso === null) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function isPending(signer: EnvelopeSigner): boolean {
  return signer.signed_at === null && signer.declined_at === null;
}

export interface SignerRowView {
  readonly steps: ReadonlyArray<MiniTrackStep>;
  readonly trackLabel: string;
  readonly when: string;
  readonly bad: boolean;
}

/**
 * Derived per-signer view: the Sent, Opened, Signed track and its short
 * "when" text. Declined and bounced mark the failing dot; a finished-bad
 * envelope (expired, withdrawn) greys what will no longer happen.
 */
export function signerRowView(
  envelope: Envelope,
  signer: EnvelopeSigner,
  now: Date = new Date(),
): SignerRowView {
  const sentAt = signer.invited_at ?? envelope.sent_at;
  const ordered = isFeatureEnabled('signingOrder') && envelope.delivery_mode === 'sequential';
  const notInvited = ordered && (signer.invited_at === null || signer.invited_at === undefined);
  const dead = envelope.status === 'canceled' || envelope.status === 'expired';
  const step = (name: string, state: MiniTrackStep['state']): MiniTrackStep => ({
    label: name,
    state,
  });

  if (signer.signed_at !== null) {
    return {
      steps: [step('Sent', 'done'), step('Opened', 'done'), step('Signed', 'done')],
      trackLabel: 'Signed',
      when: `Signed · ${formatShortDate(signer.signed_at, { now })}`,
      bad: false,
    };
  }
  if (signer.declined_at !== null) {
    return {
      steps: [
        step('Sent', 'done'),
        step('Opened', signer.viewed_at !== null ? 'done' : 'todo'),
        step('Signed', 'bad'),
      ],
      trackLabel: 'Declined',
      when: `Declined · ${relativeShort(signer.declined_at, now)}`,
      bad: true,
    };
  }
  if (signer.status === 'bounced') {
    return {
      steps: [step('Sent', 'bad'), step('Opened', 'todo'), step('Signed', 'todo')],
      trackLabel: 'Email bounced',
      when: 'Bounced',
      bad: true,
    };
  }
  if (dead) {
    const opened = signer.viewed_at !== null;
    const word = envelope.status === 'expired' ? 'Expired' : 'Withdrawn';
    return {
      steps: [step('Sent', 'done'), step('Opened', opened ? 'done' : 'off'), step('Signed', 'off')],
      trackLabel: word,
      when: word,
      bad: false,
    };
  }
  if (notInvited) {
    return {
      steps: [step('Sent', 'now'), step('Opened', 'todo'), step('Signed', 'todo')],
      trackLabel: 'Waiting for their turn',
      when: 'Waiting',
      bad: false,
    };
  }
  if (signer.viewed_at !== null) {
    return {
      steps: [step('Sent', 'done'), step('Opened', 'done'), step('Signed', 'now')],
      trackLabel: 'Opened, not signed',
      when: `Opened · ${relativeShort(signer.viewed_at, now)}`,
      bad: false,
    };
  }
  return {
    steps: [step('Sent', 'done'), step('Opened', 'now'), step('Signed', 'todo')],
    trackLabel: 'Sent, not opened',
    when: `Sent · ${relativeShort(sentAt, now)}`,
    bad: false,
  };
}

export interface ActivityRowView {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly tone: 'neutral' | 'ok' | 'bad';
  readonly text: string;
  readonly time: string;
}

const QUIET_EVENTS: ReadonlySet<string> = new Set([
  'tc_accepted',
  'esign_disclosure_acknowledged',
  'intent_to_sign_confirmed',
  'field_filled',
  'session_invalidated_by_decline',
  'session_invalidated_by_cancel',
  'job_failed',
  'retention_deleted',
  'document_added',
  'access_code_sent',
  'access_code_verified',
  'access_code_failed',
  'approval_decided',
]);

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function stringMeta(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function relativeOrDate(iso: string, now: Date): string {
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < 24 * 3_600_000) return diff < 60_000 ? 'now' : `${relativeShort(iso, now)} ago`;
  return formatShortDate(iso, { now });
}

/** Activity rows, newest first, in the short copy of the design. */
export function activityRows(
  envelope: Envelope,
  events: ReadonlyArray<EnvelopeEvent>,
  now: Date = new Date(),
): ReadonlyArray<ActivityRowView> {
  const signerById = new Map(envelope.signers.map((s) => [s.id, s]));
  const names = new Map(envelope.signers.map((s) => [s.id, s.name]));
  const rows: ActivityRowView[] = [];
  for (const ev of events) {
    const signer = ev.signer_id !== null ? signerById.get(ev.signer_id) : undefined;
    const who = signer ? firstName(signer.name) : null;
    const meta = ev.metadata ?? {};
    const time = relativeOrDate(ev.created_at, now);
    const push = (
      icon: LucideIcon,
      text: string,
      tone: ActivityRowView['tone'] = 'neutral',
    ): void => {
      rows.push({ id: ev.id, time, icon, text, tone });
    };
    switch (ev.event_type) {
      case 'created':
        push(FilePlus, 'Created');
        break;
      case 'pdf_uploaded': {
        const pages = typeof meta.pages === 'number' ? meta.pages : null;
        push(FilePlus, pages !== null ? `PDF uploaded · ${pages} pages` : 'PDF uploaded');
        break;
      }
      case 'sent': {
        const n = envelope.signers.length;
        const ordered = isFeatureEnabled('signingOrder') && envelope.delivery_mode === 'sequential';
        const people = `${n} signer${n === 1 ? '' : 's'}`;
        push(Send, ordered ? `Sent in order to ${people}` : `Sent to ${people}`);
        break;
      }
      case 'viewed':
        push(Eye, `${who ?? 'Signer'} opened`);
        break;
      case 'signed':
        push(PenLine, `${who ?? 'Signer'} signed`, 'ok');
        break;
      case 'declined':
        push(XCircle, `${who ?? 'Signer'} declined`, 'bad');
        break;
      case 'reminder_sent':
        push(
          Bell,
          `${ev.actor_kind === 'system' ? 'Auto-reminder' : 'Reminder'} to ${who ?? 'signer'}`,
        );
        break;
      case 'step_started':
        push(Send, stepStartedText(ev.metadata, names));
        break;
      case 'signer_corrected': {
        const to = stringMeta(meta, 'new_email');
        push(PencilRuler, `Fixed ${who ?? 'signer'}'s email${to ? ` to ${to}` : ''}`);
        break;
      }
      case 'signer_replaced': {
        const from = stringMeta(meta, 'previous_name');
        const to = stringMeta(meta, 'new_name');
        push(UserRoundCog, `Replaced ${from ?? 'a signer'} with ${to ?? 'someone else'}`);
        break;
      }
      case 'expiry_changed':
        push(Clock, 'Expiry changed');
        break;
      case 'all_signed':
        push(PenLine, 'Everyone signed', 'ok');
        break;
      case 'sealed':
        push(ShieldCheck, 'Sealed', 'ok');
        break;
      case 'expired':
        push(Clock, 'Expired', 'bad');
        break;
      case 'canceled':
        push(Ban, 'You withdrew');
        break;
      default:
        if (!QUIET_EVENTS.has(ev.event_type)) push(PencilRuler, ev.event_type);
    }
  }
  return rows.reverse();
}
