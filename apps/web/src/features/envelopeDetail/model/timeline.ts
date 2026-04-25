import {
  Bell,
  CheckCircle,
  Clock,
  Eye,
  FilePlus,
  PencilRuler,
  PenTool,
  Send,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import type { ActivityTimelineEvent, ActivityTimelineTone } from '@/components/ActivityTimeline';
import type { Envelope, EnvelopeEvent } from '@/features/envelopes';
import { formatWhen } from './lib';

const QUIET_EVENT_TYPES: ReadonlySet<string> = new Set([
  'tc_accepted',
  'field_filled',
  'session_invalidated_by_decline',
  'job_failed',
  'retention_deleted',
]);

/**
 * Folds the raw event log into the renderable timeline shape, and appends
 * synthetic "pending signature" rows for non-terminal envelopes so the UX
 * shows progress instead of an abrupt cutoff after the last server event.
 */
export function eventsToTimeline(
  envelope: Envelope,
  events: ReadonlyArray<EnvelopeEvent>,
): ReadonlyArray<ActivityTimelineEvent> {
  const signerById = new Map(envelope.signers.map((s) => [s.id, s]));
  const rendered: ActivityTimelineEvent[] = [];
  for (const ev of events) {
    const signer = ev.signer_id !== null ? signerById.get(ev.signer_id) : undefined;
    const by = signer?.name ?? (ev.actor_kind === 'system' ? 'System' : 'You');
    const at = formatWhen(ev.created_at);
    const base = { id: ev.id, at, by };
    switch (ev.event_type) {
      case 'created':
        rendered.push({
          ...base,
          icon: FilePlus,
          tone: 'indigo',
          text: 'Envelope created from PDF upload',
          kind: 'created',
        });
        break;
      case 'sent':
        rendered.push({
          ...base,
          icon: Send,
          tone: 'indigo',
          text: `Sent to ${envelope.signers.length} signer${envelope.signers.length === 1 ? '' : 's'}`,
          kind: 'sent',
        });
        break;
      case 'viewed':
        rendered.push({
          ...base,
          icon: Eye,
          tone: 'slate',
          text: 'Opened the envelope',
          kind: 'viewed',
        });
        break;
      case 'signed':
        rendered.push({
          ...base,
          icon: PenTool,
          tone: 'success',
          text: 'Signed the document',
          kind: 'signed',
        });
        break;
      case 'declined':
        rendered.push({
          ...base,
          icon: XCircle,
          tone: 'danger',
          text: 'Declined to sign',
          kind: 'declined',
        });
        break;
      case 'reminder_sent':
        rendered.push({
          ...base,
          icon: Bell,
          tone: 'indigo',
          text: 'Reminder sent',
          kind: 'reminder',
        });
        break;
      case 'sealed':
        rendered.push({
          ...base,
          icon: ShieldCheck,
          tone: 'success',
          text: 'Envelope sealed — audit trail locked',
          kind: 'sealed',
        });
        break;
      case 'all_signed':
        rendered.push({
          ...base,
          icon: CheckCircle,
          tone: 'success',
          text: 'All signatures collected',
          kind: 'complete',
        });
        break;
      case 'expired':
        rendered.push({
          ...base,
          icon: Clock,
          tone: 'amber',
          text: 'Signing window closed before completion',
          kind: 'expired',
        });
        break;
      case 'canceled':
        rendered.push({
          ...base,
          icon: X,
          tone: 'slate',
          text: 'Envelope canceled',
          kind: 'canceled',
        });
        break;
      default: {
        if (!QUIET_EVENT_TYPES.has(ev.event_type)) {
          rendered.push({
            ...base,
            icon: PencilRuler,
            tone: 'slate' as ActivityTimelineTone,
            text: ev.event_type,
            kind: ev.event_type,
          });
        }
      }
    }
  }

  if (envelope.status === 'awaiting_others' || envelope.status === 'sealing') {
    for (const s of envelope.signers) {
      if (s.signed_at === null && s.declined_at === null) {
        rendered.push({
          id: `pending-${s.id}`,
          icon: Clock,
          tone: 'amber',
          text: 'Waiting on signature',
          by: s.name,
          at: null,
          kind: 'pending',
          pending: true,
        });
      }
    }
  }

  return rendered;
}
