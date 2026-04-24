import { useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCircle,
  Clock,
  Download,
  Eye,
  FilePlus,
  PencilRuler,
  PenTool,
  Send,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { ActivityTimeline } from '../../components/ActivityTimeline';
import type {
  ActivityTimelineEvent,
  ActivityTimelineTone,
} from '../../components/ActivityTimeline';
import { Avatar } from '../../components/Avatar';
import { Badge } from '../../components/Badge';
import type { BadgeTone } from '../../components/Badge/Badge.types';
import { Button } from '../../components/Button';
import { Skeleton } from '../../components/Skeleton';
import { useEnvelopeEventsQuery, useEnvelopeQuery } from '../../features/envelopes';
import type {
  Envelope,
  EnvelopeEvent,
  EnvelopeStatus,
  SignerUiStatus,
} from '../../features/envelopes';
import {
  Actions,
  AuditCallout,
  Breadcrumb,
  BreadcrumbCode,
  BreadcrumbLink,
  Card,
  Eyebrow,
  Grid,
  HeadActions,
  HeadCode,
  HeadMeta,
  HeadRow,
  HeadText,
  Inner,
  ProgressCard,
  ProgressFill,
  ProgressLabel,
  ProgressLeft,
  ProgressStat,
  ProgressStats,
  ProgressStatValue,
  ProgressTrack,
  SignerEmail,
  SignerItem,
  SignerList,
  SignerName,
  SignerNames,
  SignersCard,
  SignersHeading,
  Sidebar,
  Title,
  TimelineCard,
  TimelineHeading,
  TimelineSubtitle,
  Wrap,
} from './EnvelopeDetailPage.styles';

const STATUS_LABEL: Record<EnvelopeStatus, string> = {
  draft: 'Draft',
  awaiting_others: 'Awaiting others',
  sealing: 'Sealing',
  completed: 'Completed',
  declined: 'Declined',
  expired: 'Expired',
  canceled: 'Canceled',
};

const STATUS_TONE: Record<EnvelopeStatus, BadgeTone> = {
  draft: 'neutral',
  awaiting_others: 'amber',
  sealing: 'indigo',
  completed: 'emerald',
  declined: 'red',
  expired: 'red',
  canceled: 'neutral',
};

const SIGNER_STATUS_LABEL: Record<SignerUiStatus, string> = {
  awaiting: 'Waiting',
  viewing: 'Viewing',
  completed: 'Signed',
  declined: 'Declined',
};

const SIGNER_STATUS_TONE: Record<SignerUiStatus, BadgeTone> = {
  awaiting: 'amber',
  viewing: 'indigo',
  completed: 'emerald',
  declined: 'red',
};

function formatWhen(iso: string | null): string {
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

function formatDateOnly(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

/**
 * Turn the backend event log into the timeline fragment shape. Unknown
 * event types collapse to a neutral slate entry rather than being
 * dropped entirely — drift-friendly.
 */
function eventsToTimeline(
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
        // Swallow system-noise events from the kit (tc_accepted,
        // field_filled, session_invalidated_by_decline, job_failed,
        // retention_deleted) — they would clutter a sender timeline.
        const quiet = new Set([
          'tc_accepted',
          'field_filled',
          'session_invalidated_by_decline',
          'job_failed',
          'retention_deleted',
        ]);
        if (!quiet.has(ev.event_type)) {
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

  // Append a synthetic "pending" entry for outstanding signers when the
  // envelope isn't terminal — matches the kit's "waiting on …" rows.
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

/**
 * L4 page — envelope detail view with animated activity timeline + a
 * sticky sidebar showing signers and the audit-trail callout. Matches
 * the kit's EnvelopeDetail spec: breadcrumb, serif header, progress
 * banner, two-column body.
 */
export function EnvelopeDetailPage() {
  const { id } = useParams<{ readonly id: string }>();
  const navigate = useNavigate();
  const q = useEnvelopeQuery(id ?? '', Boolean(id));
  const ev = useEnvelopeEventsQuery(id ?? '', Boolean(id));

  const envelope = q.data;
  const events = ev.data?.events ?? [];

  const timelineEvents = useMemo(
    () => (envelope ? eventsToTimeline(envelope, events) : []),
    [envelope, events],
  );

  if (q.isPending) {
    return (
      <Wrap>
        <Inner>
          <Card aria-busy="true">
            <Skeleton width={260} height={32} />
            <div style={{ marginTop: 12 }}>
              <Skeleton width={140} />
            </div>
          </Card>
        </Inner>
      </Wrap>
    );
  }

  if (q.error || !envelope) {
    return (
      <Wrap>
        <Inner>
          <Card>
            <Title>Document not found</Title>
            <div style={{ marginTop: 12, color: 'inherit', fontSize: 14 }}>
              We couldn&apos;t load this document. It may have been removed, or the link is stale.
            </div>
            <Actions>
              <Button variant="primary" iconLeft={ArrowLeft} onClick={() => navigate('/documents')}>
                Back to documents
              </Button>
            </Actions>
          </Card>
        </Inner>
      </Wrap>
    );
  }

  const signed = envelope.signers.filter((s) => s.status === 'completed').length;
  const total = envelope.signers.length;
  const pct = total === 0 ? 0 : Math.round((signed / total) * 100);
  const waiting = envelope.signers.filter(
    (s) => s.status === 'awaiting' || s.status === 'viewing',
  ).length;
  const isComplete = envelope.status === 'completed';
  const isDeclined = envelope.status === 'declined' || envelope.status === 'expired';

  return (
    <Wrap>
      <Inner>
        <Breadcrumb>
          <BreadcrumbLink type="button" onClick={() => navigate('/documents')}>
            <ArrowLeft size={14} /> Documents
          </BreadcrumbLink>
          <span>/</span>
          <BreadcrumbCode>{envelope.short_code}</BreadcrumbCode>
        </Breadcrumb>

        <HeadRow>
          <HeadText>
            <Eyebrow>Envelope</Eyebrow>
            <Title>{envelope.title}</Title>
            <HeadMeta>
              <Badge tone={STATUS_TONE[envelope.status]}>{STATUS_LABEL[envelope.status]}</Badge>
              <span>
                <HeadCode>{envelope.short_code}</HeadCode>
                {envelope.original_pages !== null ? ` · ${envelope.original_pages} pages` : null}
              </span>
              <span>Sent {formatDateOnly(envelope.sent_at)}</span>
            </HeadMeta>
          </HeadText>
          <HeadActions>
            <Button variant="secondary" iconLeft={Download}>
              Download PDF
            </Button>
            <Button variant="secondary" iconLeft={Bell}>
              Send reminder
            </Button>
            {envelope.status !== 'completed' ? (
              <Button variant="secondary" iconLeft={X}>
                Withdraw
              </Button>
            ) : null}
          </HeadActions>
        </HeadRow>

        <ProgressCard>
          <ProgressLeft>
            <ProgressLabel>
              {signed} of {total} signed — {pct}% complete
            </ProgressLabel>
            <ProgressTrack>
              <ProgressFill $pct={pct} $complete={isComplete} $declined={isDeclined} />
            </ProgressTrack>
          </ProgressLeft>
          <ProgressStats>
            <ProgressStat>
              <ProgressStatValue>{signed}</ProgressStatValue>
              Signed
            </ProgressStat>
            <ProgressStat>
              <ProgressStatValue $tone="warn">{waiting}</ProgressStatValue>
              Waiting
            </ProgressStat>
            <ProgressStat>
              <ProgressStatValue>{timelineEvents.length}</ProgressStatValue>
              Events
            </ProgressStat>
          </ProgressStats>
        </ProgressCard>

        <Grid>
          <TimelineCard>
            <TimelineHeading>Activity timeline</TimelineHeading>
            <TimelineSubtitle>
              Every event on this envelope — cryptographically sealed in the audit trail.
            </TimelineSubtitle>
            <ActivityTimeline events={timelineEvents} />
          </TimelineCard>

          <Sidebar>
            <SignersCard>
              <SignersHeading>Signers</SignersHeading>
              {envelope.signers.length === 0 ? (
                <div style={{ fontSize: 13, color: 'inherit' }}>No signers on this envelope.</div>
              ) : (
                <SignerList>
                  {envelope.signers.map((s) => (
                    <SignerItem key={s.id}>
                      <Avatar name={s.name} size={32} />
                      <SignerNames>
                        <SignerName>{s.name}</SignerName>
                        <SignerEmail>{s.email}</SignerEmail>
                      </SignerNames>
                      <Badge tone={SIGNER_STATUS_TONE[s.status]} dot={false}>
                        {SIGNER_STATUS_LABEL[s.status]}
                      </Badge>
                    </SignerItem>
                  ))}
                </SignerList>
              )}
            </SignersCard>

            <AuditCallout>
              <ShieldCheck size={18} aria-hidden />
              <div>
                <strong>Audit trail</strong> — this envelope uses eIDAS-qualified signatures. Every
                event is timestamped and cryptographically sealed.
                <div style={{ marginTop: 6, fontWeight: 600 }}>
                  View full audit trail <ArrowRight size={12} style={{ verticalAlign: 'middle' }} />
                </div>
              </div>
            </AuditCallout>
          </Sidebar>
        </Grid>
      </Inner>
    </Wrap>
  );
}
