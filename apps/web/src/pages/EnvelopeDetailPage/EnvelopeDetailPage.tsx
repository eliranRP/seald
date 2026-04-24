import { useCallback, useMemo, useState } from 'react';
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
import { ExitConfirmDialog } from '../../components/ExitConfirmDialog';
import { Skeleton } from '../../components/Skeleton';
import {
  ENVELOPES_KEY,
  ENVELOPE_EVENTS_KEY,
  ENVELOPE_KEY,
  getEnvelopeDownloadUrl,
  remindEnvelopeSigner,
  useEnvelopeEventsQuery,
  useEnvelopeQuery,
} from '../../features/envelopes';
import { useDeleteEnvelopeMutation } from '../../features/envelopes/useEnvelopes';
import type {
  Envelope,
  EnvelopeEvent,
  EnvelopeStatus,
  SignerUiStatus,
} from '../../features/envelopes';
import { useQueryClient } from '@tanstack/react-query';
import {
  Actions,
  AuditAction,
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
  Muted,
  NotFoundHint,
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
  SignersEmpty,
  SignersHeading,
  Sidebar,
  StatusToast,
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

const TERMINAL_STATUSES: ReadonlySet<EnvelopeStatus> = new Set([
  'completed',
  'declined',
  'expired',
  'canceled',
]);

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

interface ActionToast {
  readonly kind: 'success' | 'danger';
  readonly text: string;
}

/**
 * L4 page — envelope detail view with animated activity timeline + a
 * sticky sidebar showing signers and the audit-trail callout.
 *
 * Header actions:
 *   - Download PDF — intentionally disabled; the backend doesn't yet
 *     expose a signed-URL endpoint. Surfaces with a "Coming soon" tip.
 *   - Send reminder — fans out `POST /envelopes/:id/signers/:sid/remind`
 *     across every signer still waiting. 429s (1/hour throttle) aggregate
 *     into the toast; a partial-success is reported.
 *   - Withdraw — for DRAFT envelopes only (the backend currently supports
 *     `deleteDraft` but has no sent-envelope cancel). Hidden for other
 *     statuses so the control doesn't bait a click that can't complete.
 *   - Breadcrumb Documents — navigates to `/documents`.
 *   - View audit trail — opens `/verify/code/:short_code` in a new tab,
 *     the public verify page sealed into every outbound email.
 */
export function EnvelopeDetailPage() {
  const { id } = useParams<{ readonly id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useEnvelopeQuery(id ?? '', Boolean(id));
  const ev = useEnvelopeEventsQuery(id ?? '', Boolean(id));
  const deleteEnvelope = useDeleteEnvelopeMutation();

  const [toast, setToast] = useState<ActionToast | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [remindInFlight, setRemindInFlight] = useState(false);
  const [downloadInFlight, setDownloadInFlight] = useState(false);

  const envelope = q.data;
  const events = ev.data?.events ?? [];

  const timelineEvents = useMemo(
    () => (envelope ? eventsToTimeline(envelope, events) : []),
    [envelope, events],
  );

  const handleBack = useCallback(() => navigate('/documents'), [navigate]);

  const handleViewAudit = useCallback(() => {
    if (!envelope) return;
    // The public verify page lives under /verify/code/<short_code>. Open
    // in a new tab so the sender doesn't lose context.
    window.open(`/verify/code/${envelope.short_code}`, '_blank', 'noopener,noreferrer');
  }, [envelope]);

  const handleDownload = useCallback(async () => {
    if (!envelope) return;
    setDownloadInFlight(true);
    setToast(null);
    try {
      const { url, kind } = await getEnvelopeDownloadUrl(envelope.id);
      // Programmatic anchor click — honours the server's
      // `Content-Disposition: attachment` when the signed URL carries
      // it, otherwise the browser opens the PDF inline which is also a
      // reasonable default for a preview.
      const a = document.createElement('a');
      a.href = url;
      a.rel = 'noopener noreferrer';
      a.download = `${envelope.short_code}-${kind}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setToast({
        kind: 'success',
        text: kind === 'sealed' ? 'Downloading sealed PDF…' : 'Downloading original PDF…',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed.';
      setToast({
        kind: 'danger',
        text: /file_not_ready/.test(msg)
          ? 'The PDF has not been attached to this envelope yet.'
          : msg,
      });
    } finally {
      setDownloadInFlight(false);
    }
  }, [envelope]);

  const handleSendReminder = useCallback(async () => {
    if (!envelope) return;
    const pending = envelope.signers.filter((s) => s.signed_at === null && s.declined_at === null);
    if (pending.length === 0) {
      setToast({ kind: 'danger', text: 'No one is waiting on a signature.' });
      return;
    }
    setRemindInFlight(true);
    setToast(null);
    const results = await Promise.allSettled(
      pending.map((s) => remindEnvelopeSigner(envelope.id, s.id)),
    );
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - sent;
    setRemindInFlight(false);
    qc.invalidateQueries({ queryKey: ENVELOPE_EVENTS_KEY(envelope.id) });
    qc.invalidateQueries({ queryKey: ENVELOPE_KEY(envelope.id) });
    if (failed === 0) {
      setToast({
        kind: 'success',
        text: sent === 1 ? 'Reminder sent to 1 signer.' : `Reminder sent to ${sent} signers.`,
      });
    } else if (sent === 0) {
      setToast({
        kind: 'danger',
        text:
          failed === 1
            ? 'Reminder failed. A signer was reminded in the last hour — try again later.'
            : 'Reminder failed. Signers were reminded in the last hour — try again later.',
      });
    } else {
      setToast({
        kind: 'success',
        text: `${sent} reminder${sent === 1 ? '' : 's'} sent · ${failed} throttled.`,
      });
    }
  }, [envelope, qc]);

  const handleConfirmWithdraw = useCallback(() => {
    if (!envelope) return;
    setWithdrawOpen(false);
    deleteEnvelope.mutate(envelope.id, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ENVELOPES_KEY });
        navigate('/documents');
      },
      onError: (err) => {
        setToast({
          kind: 'danger',
          text: err instanceof Error ? err.message : 'Could not withdraw this envelope.',
        });
      },
    });
  }, [envelope, deleteEnvelope, qc, navigate]);

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
            <NotFoundHint>
              We couldn&apos;t load this document. It may have been removed, or the link is stale.
            </NotFoundHint>
            <Actions>
              <Button variant="primary" iconLeft={ArrowLeft} onClick={handleBack}>
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
  const isTerminal = TERMINAL_STATUSES.has(envelope.status);
  const hasPending = envelope.signers.some((s) => s.signed_at === null && s.declined_at === null);

  return (
    <Wrap>
      <Inner>
        <Breadcrumb>
          <BreadcrumbLink type="button" onClick={handleBack}>
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
            <Button
              variant="secondary"
              iconLeft={Download}
              onClick={handleDownload}
              loading={downloadInFlight}
              title="Downloads the sealed PDF if available, otherwise the original upload."
            >
              Download PDF
            </Button>
            <Button
              variant="secondary"
              iconLeft={Bell}
              onClick={handleSendReminder}
              loading={remindInFlight}
              disabled={!hasPending || isTerminal}
              title={
                isTerminal
                  ? 'This envelope is closed — no reminders to send.'
                  : !hasPending
                    ? 'Every signer has already signed or declined.'
                    : undefined
              }
            >
              Send reminder
            </Button>
            {envelope.status === 'draft' ? (
              <Button
                variant="secondary"
                iconLeft={X}
                onClick={() => setWithdrawOpen(true)}
                loading={deleteEnvelope.isPending}
              >
                Withdraw
              </Button>
            ) : null}
          </HeadActions>
        </HeadRow>

        {toast !== null ? (
          <StatusToast role={toast.kind === 'danger' ? 'alert' : 'status'} $kind={toast.kind}>
            {toast.text}
          </StatusToast>
        ) : null}

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
                <SignersEmpty>No signers on this envelope.</SignersEmpty>
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
                <strong>Audit trail</strong>
                <Muted>
                  This envelope uses eIDAS-qualified signatures. Every event is timestamped and
                  cryptographically sealed.
                </Muted>
                <AuditAction type="button" onClick={handleViewAudit}>
                  View full audit trail <ArrowRight size={12} />
                </AuditAction>
              </div>
            </AuditCallout>
          </Sidebar>
        </Grid>
      </Inner>

      <ExitConfirmDialog
        open={withdrawOpen}
        title="Withdraw this envelope?"
        description="This draft will be permanently removed. The action cannot be undone."
        confirmLabel="Withdraw"
        cancelLabel="Keep draft"
        onConfirm={handleConfirmWithdraw}
        onCancel={() => setWithdrawOpen(false)}
      />
    </Wrap>
  );
}
