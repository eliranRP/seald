import { useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  FileCheck2,
  FileText,
  Package,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import { DownloadMenu } from '@/components/DownloadMenu';
import type { DownloadMenuItem } from '@/components/DownloadMenu';
import { ExitConfirmDialog } from '@/components/ExitConfirmDialog';
import { Skeleton } from '@/components/Skeleton';
import { useEnvelopeEventsQuery, useEnvelopeQuery } from '@/features/envelopes';
import {
  SIGNER_STATUS_LABEL,
  SIGNER_STATUS_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  eventsToTimeline,
  formatDateOnly,
  useEnvelopeDetailController,
  useEnvelopeProgress,
} from '@/features/envelopeDetail';
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

/**
 * L4 page — envelope detail view with animated activity timeline + a
 * sticky sidebar showing signers and the audit-trail callout.
 *
 * Header actions:
 *   - Download PDF — intentionally disabled when not ready; the backend
 *     surfaces a `file_not_ready` we translate into a "Coming soon" tip.
 *   - Send reminder — fans out `POST /envelopes/:id/signers/:sid/remind`
 *     across every signer still waiting. 429s (1/hour throttle) aggregate
 *     into the toast; a partial-success is reported.
 *   - Withdraw — for DRAFT envelopes only (the backend currently supports
 *     `deleteDraft` but has no sent-envelope cancel). Hidden for other
 *     statuses so the control doesn't bait a click that can't complete.
 *   - Breadcrumb Documents — navigates to `/documents`.
 *   - View audit trail — opens `/verify/code/:short_code` in a new tab,
 *     the public verify page sealed into every outbound email.
 *
 * All business logic + transient action state is owned by the
 * `useEnvelopeDetailController` hook (rule 1.5 — pages are thin).
 */
export function EnvelopeDetailPage() {
  const { id } = useParams<{ readonly id: string }>();
  const q = useEnvelopeQuery(id ?? '', Boolean(id));
  const ev = useEnvelopeEventsQuery(id ?? '', Boolean(id));

  const envelope = q.data;
  const events = useMemo(() => ev.data?.events ?? [], [ev.data]);

  const timelineEvents = useMemo(
    () => (envelope ? eventsToTimeline(envelope, events) : []),
    [envelope, events],
  );

  const {
    toast,
    withdrawOpen,
    remindInFlight,
    downloadInFlight,
    auditInFlight,
    deleteIsPending,
    handleBack,
    openWithdraw,
    closeWithdraw,
    handleDownload,
    handleViewAudit,
    handleSendReminder,
    handleConfirmWithdraw,
  } = useEnvelopeDetailController({ envelope });

  // Derived progress numbers — single-pass over `envelope.signers`. Hook is
  // safe to call before the envelope resolves (returns zero-value snapshot).
  const { signed, total, waiting, pct, isComplete, isDeclined, isTerminal, hasPending } =
    useEnvelopeProgress(envelope);

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

  const originalAvailable = envelope.original_pages !== null;
  const downloadItems: ReadonlyArray<DownloadMenuItem> = [
    {
      kind: 'original',
      icon: FileText,
      title: 'Original PDF',
      description: 'The document as uploaded — no signatures, no fields.',
      meta: originalAvailable
        ? `${envelope.original_pages ?? 0} pages`
        : 'Upload the PDF to this draft first.',
      available: originalAvailable,
      primaryLabel: 'original',
    },
    {
      kind: 'sealed',
      icon: FileCheck2,
      title: 'Sealed PDF',
      description: 'Final signed document with all fields filled and certificate page.',
      meta: isComplete ? 'Signed + audit-stamped' : 'Available once all signers complete',
      available: isComplete,
      recommended: isComplete,
      primaryLabel: 'sealed PDF',
    },
    {
      kind: 'audit',
      icon: ShieldCheck,
      title: 'Audit trail',
      description: 'Cryptographic event log — IPs, timestamps, hashes.',
      meta: isComplete ? 'PDF' : 'Produced when the envelope is sealed',
      available: isComplete,
    },
    {
      kind: 'bundle',
      icon: Package,
      title: 'Full package',
      description: 'Sealed PDF + audit trail bundled together.',
      meta: isComplete ? 'Sealed + audit in separate tabs' : 'Available once sealed',
      available: isComplete,
    },
  ];

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
            <DownloadMenu
              items={downloadItems}
              onSelect={handleDownload}
              inFlight={downloadInFlight}
            />
            <Button
              variant="secondary"
              iconLeft={Bell}
              onClick={handleSendReminder}
              loading={remindInFlight}
              disabled={!hasPending || isTerminal}
              title={(() => {
                if (isTerminal) return 'This envelope is closed — no reminders to send.';
                if (!hasPending) return 'Every signer has already signed or declined.';
                return undefined;
              })()}
            >
              Send reminder
            </Button>
            {envelope.status === 'draft' ? (
              <Button
                variant="secondary"
                iconLeft={X}
                onClick={openWithdraw}
                loading={deleteIsPending}
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
                {/* The audit PDF is produced by the sealing job, so it
                    only exists once the envelope is completed. Hide the
                    download control entirely for non-terminal envelopes
                    so the user never clicks into a file_not_ready. */}
                {isComplete ? (
                  <AuditAction
                    type="button"
                    onClick={handleViewAudit}
                    disabled={auditInFlight}
                    aria-busy={auditInFlight}
                  >
                    {auditInFlight ? 'Opening audit trail…' : 'Download audit trail'}
                    <ArrowRight size={12} />
                  </AuditAction>
                ) : (
                  <Muted>
                    The audit trail PDF will be available once every signer has signed and the
                    envelope is sealed.
                  </Muted>
                )}
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
        onCancel={closeWithdraw}
      />
    </Wrap>
  );
}
