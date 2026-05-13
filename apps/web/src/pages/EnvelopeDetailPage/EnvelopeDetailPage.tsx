import { useCallback, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCircle,
  Clock,
  Eye,
  FileCheck2,
  FileText,
  FilePlus,
  Package,
  PencilRuler,
  PenTool,
  Send,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isFeatureEnabled } from 'shared';
import { ActivityTimeline } from '@/components/ActivityTimeline';
import type { ActivityTimelineEvent, ActivityTimelineTone } from '@/components/ActivityTimeline';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import type { BadgeTone } from '@/components/Badge/Badge.types';
import { Button } from '@/components/Button';
import { DownloadMenu } from '@/components/DownloadMenu';
import type { DownloadMenuItem } from '@/components/DownloadMenu';
import { ExitConfirmDialog } from '@/components/ExitConfirmDialog';
import { Skeleton } from '@/components/Skeleton';
import { TagEditor } from '@/components/TagEditor';
import { patchEnvelope } from '@/features/envelopes/envelopesApi';
import {
  envelopeKeys,
  getEnvelopeDownloadUrl,
  remindEnvelopeSigner,
  useEnvelopeEventsQuery,
  useEnvelopeQuery,
} from '@/features/envelopes';
import { formatShortDateOrDash, formatTimelineWhen } from '@/lib/dateFormat';
import {
  useCancelEnvelopeMutation,
  useDeleteEnvelopeMutation,
} from '@/features/envelopes/useEnvelopes';
import { useSaveEnvelopeToGdrive } from '@/features/gdriveExport';
import { GDriveLogo } from '@/features/gdriveImport/GDriveLogo';
import type { Envelope, EnvelopeEvent, EnvelopeStatus, SignerUiStatus } from '@/features/envelopes';
import {
  Actions,
  AuditAction,
  AuditCallout,
  Breadcrumb,
  BreadcrumbLink,
  BreadcrumbTitle,
  Card,
  Eyebrow,
  Grid,
  HeadActions,
  HeadCode,
  HeadMeta,
  HeadMetaTagSlot,
  HeadRow,
  HeadText,
  Inner,
  MetaSeparator,
  Muted,
  NotFoundHint,
  ProgressCard,
  ProgressFill,
  ProgressLabel,
  ProgressLeft,
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
  completed: 'Sealed',
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

/**
 * Always-year-aware date helpers — see `apps/web/src/lib/dateFormat.ts`
 * and `dateFormat.test.ts`. The previous in-line versions omitted the
 * year (BUG-2), making the timeline + header indistinguishable for
 * envelopes shipped in a prior calendar year.
 */
function formatWhen(iso: string | null): string {
  return formatTimelineWhen(iso);
}

function formatDateOnly(iso: string | null): string {
  return formatShortDateOrDash(iso);
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
          text: 'Envelope created',
          kind: 'created',
        });
        break;
      case 'pdf_uploaded': {
        // `metadata.pages` is set by `setOriginalFile` — include it
        // when present so the row reads "PDF uploaded — N pages" and
        // is visibly different from the "Envelope created" row above.
        const meta = (ev.metadata ?? {}) as { readonly pages?: unknown };
        const pages = typeof meta.pages === 'number' ? meta.pages : null;
        const text =
          pages !== null ? `PDF uploaded — ${pages} page${pages === 1 ? '' : 's'}` : 'PDF uploaded';
        rendered.push({
          ...base,
          icon: FilePlus,
          tone: 'indigo',
          text,
          kind: 'pdf_uploaded',
        });
        break;
      }
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
 *   - Withdraw — visible on `draft`, `awaiting_others`, and `sealing`
 *     envelopes. Drafts route through `deleteDraft` (no email side-effects);
 *     sent envelopes hit `POST /envelopes/:id/cancel`, which flips the
 *     status to `canceled`, revokes pending access tokens, and fans out
 *     `withdrawn_to_signer` / `withdrawn_after_sign` notifications.
 *     Terminal envelopes (completed / declined / expired / canceled) hide
 *     the control so the user doesn't bait a click that can't complete.
 *   - Breadcrumb Documents — navigates to `/documents`.
 *   - View audit trail — opens `/verify/:short_code` in a new tab,
 *     the public verify page sealed into every outbound email.
 */
export function EnvelopeDetailPage() {
  const { id } = useParams<{ readonly id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useEnvelopeQuery(id ?? '', Boolean(id));
  const ev = useEnvelopeEventsQuery(id ?? '', Boolean(id));
  const deleteEnvelope = useDeleteEnvelopeMutation();
  const cancelEnvelope = useCancelEnvelopeMutation();
  const gdriveEnabled = isFeatureEnabled('gdriveIntegration');
  const { save: saveToGdrive, inFlight: gdriveInFlight } = useSaveEnvelopeToGdrive();

  const [toast, setToast] = useState<ActionToast | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [remindInFlight, setRemindInFlight] = useState(false);
  const [downloadInFlight, setDownloadInFlight] = useState<string | null>(null);
  const [auditInFlight, setAuditInFlight] = useState(false);

  const envelope = q.data;
  const events = useMemo(() => ev.data?.events ?? [], [ev.data]);

  const timelineEvents = useMemo(
    () => (envelope ? eventsToTimeline(envelope, events) : []),
    [envelope, events],
  );

  const handleBack = useCallback(() => navigate('/documents'), [navigate]);

  // Tag edits are best-effort — the editor optimistically reflects
  // the new chip set; we PATCH in the background and invalidate the
  // detail + list queries on success so other surfaces (dashboard
  // chips, filter chip suggestions) refresh. Failures revert via the
  // re-fetched server value.
  const handleTagsChange = useCallback(
    async (next: ReadonlyArray<string>) => {
      if (!envelope) return;
      try {
        await patchEnvelope(envelope.id, { tags: next });
        await Promise.all([
          qc.invalidateQueries({ queryKey: envelopeKeys.detail(envelope.id) }),
          qc.invalidateQueries({ queryKey: envelopeKeys.lists() }),
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update tags.';
        setToast({ kind: 'danger', text: msg });
      }
    },
    [envelope, qc],
  );

  // Shared fetch + open-in-new-tab flow for every PDF artifact. Two
  // subtleties worth knowing:
  //   * `window.open(..., 'noopener')` returns null in every modern
  //     browser. We want a window ref so we can point it at the signed
  //     URL once the API responds — so we `open` without noopener and
  //     zero out `.opener` ourselves immediately after assigning the
  //     location. Net effect matches the `noopener` contract.
  //   * The window has to be opened *synchronously* from the click so
  //     the browser treats it as user-initiated. If we awaited first,
  //     the popup blocker would reject it on Safari/Firefox.
  const openArtifact = useCallback(
    async (kind: 'sealed' | 'original' | 'audit' | undefined, friendly: string): Promise<void> => {
      if (!envelope) return;
      const win = window.open('about:blank', '_blank');
      try {
        const { url } = await getEnvelopeDownloadUrl(envelope.id, kind);
        if (win && !win.closed) {
          try {
            win.opener = null;
          } catch {
            /* cross-origin after navigation — ignore. */
          }
          win.location.href = url;
          setToast({ kind: 'success', text: `${friendly} opened in a new tab.` });
        } else {
          // Popup blocked. Fall back to an anchor-element click, which
          // keeps the current tab on the page and (for browsers that
          // preview PDFs inline) opens the download in a new tab via
          // `target="_blank"`. This is the safest fallback that never
          // hijacks the current tab.
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setToast({
            kind: 'success',
            text: `${friendly} ready — check your browser if nothing opened (allow popups for this site).`,
          });
        }
      } catch (err) {
        if (win && !win.closed) win.close();
        const msg = err instanceof Error ? err.message : 'Download failed.';
        setToast({
          kind: 'danger',
          text: /file_not_ready/.test(msg)
            ? `The ${friendly.toLowerCase()} has not been produced for this envelope yet.`
            : msg,
        });
      }
    },
    [envelope],
  );

  // "Save to Google Drive" — the orchestration (OAuth-if-needed → folder
  // picker → server-side upload → query invalidation) lives in
  // `useSaveEnvelopeToGdrive`; here we just map its outcome onto the
  // page's existing toast surface.
  const handleSaveToGdrive = useCallback(async () => {
    if (!envelope) return;
    setToast(null);
    const outcome = await saveToGdrive(envelope);
    switch (outcome.kind) {
      case 'saved':
        setToast({
          kind: 'success',
          text: 'Saved to Google Drive. The sealed PDF + audit trail are in your folder.',
        });
        break;
      case 'partial':
        setToast({
          kind: 'danger',
          text: 'Sealed PDF saved to Drive; the audit trail upload failed — try again.',
        });
        break;
      case 'canceled':
        break;
      case 'connect-needed':
        setToast({
          kind: 'danger',
          text: 'Connect a Google Drive account to save here, then try again.',
        });
        break;
      case 'reconnect-needed':
        setToast({
          kind: 'danger',
          text: 'Your Google Drive connection expired — reconnect it, then try again.',
        });
        break;
      case 'not-sealed':
        setToast({
          kind: 'danger',
          text: "This envelope isn't sealed yet, so there's nothing to save.",
        });
        break;
      case 'permission-denied':
        setToast({
          kind: 'danger',
          text: "Couldn't write to that folder — pick another one and try again.",
        });
        break;
      case 'rate-limited':
        setToast({
          kind: 'danger',
          text: `Too many Drive requests — try again in ${outcome.retryAfterSeconds}s.`,
        });
        break;
      case 'picker-not-configured':
        setToast({
          kind: 'danger',
          text: 'The Google Drive picker is not configured on this server.',
        });
        break;
      case 'error':
        setToast({ kind: 'danger', text: outcome.message || 'Saving to Google Drive failed.' });
        break;
      default: {
        // Exhaustiveness guard — TS errors here if a new outcome variant
        // is added without a case.
        const _exhaustive: never = outcome;
        void _exhaustive;
      }
    }
  }, [envelope, saveToGdrive]);

  const handleDownload = useCallback(
    async (kind: string) => {
      if (!envelope) return;
      if (kind === 'gdrive') {
        await handleSaveToGdrive();
        return;
      }
      if (kind !== 'sealed' && kind !== 'original' && kind !== 'audit' && kind !== 'bundle') {
        return;
      }
      setDownloadInFlight(kind);
      setToast(null);
      try {
        if (kind === 'bundle') {
          // BUG-3 regression — the previous "bundle" path opened TWO
          // `target="_blank"` anchors in sequence after a Promise.all
          // resolved. Chrome/Safari's popup heuristics treat the second
          // window-open as detached from the user gesture (the click
          // handler has already returned by the time the second anchor
          // fires) and silently block it, while the success toast still
          // claimed both tabs were opened. We now open the sealed PDF
          // in a new tab (one user-gesture window) and trigger the
          // audit trail as a `download` anchor on the same page — no
          // second window, so nothing for the popup blocker to catch.
          try {
            const [sealed, audit] = await Promise.all([
              getEnvelopeDownloadUrl(envelope.id, 'sealed'),
              getEnvelopeDownloadUrl(envelope.id, 'audit'),
            ]);
            const sealedAnchor = document.createElement('a');
            sealedAnchor.href = sealed.url;
            sealedAnchor.target = '_blank';
            sealedAnchor.rel = 'noopener noreferrer';
            document.body.appendChild(sealedAnchor);
            sealedAnchor.click();
            sealedAnchor.remove();

            const auditAnchor = document.createElement('a');
            auditAnchor.href = audit.url;
            // Use the `download` attribute (not target=_blank) so the
            // browser triggers a same-document download instead of
            // opening a popup. The server-signed URL already carries
            // the audit filename in its Content-Disposition.
            auditAnchor.download = `audit-${envelope.id}.pdf`;
            auditAnchor.rel = 'noopener noreferrer';
            document.body.appendChild(auditAnchor);
            auditAnchor.click();
            auditAnchor.remove();

            setToast({
              kind: 'success',
              text: 'Sealed PDF opened in a new tab; audit trail downloaded.',
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Download failed.';
            setToast({
              kind: 'danger',
              text: /file_not_ready/.test(msg)
                ? 'The sealed artifacts have not been produced yet.'
                : msg,
            });
          }
        } else {
          let friendly: string;
          if (kind === 'sealed') friendly = 'Sealed PDF';
          else if (kind === 'audit') friendly = 'Audit trail';
          else friendly = 'Original PDF';
          await openArtifact(kind, friendly);
        }
      } finally {
        setDownloadInFlight(null);
      }
    },
    [envelope, openArtifact, handleSaveToGdrive],
  );

  const handleViewAudit = useCallback(async () => {
    if (!envelope) return;
    setAuditInFlight(true);
    setToast(null);
    try {
      await openArtifact('audit', 'Audit trail');
    } finally {
      setAuditInFlight(false);
    }
  }, [envelope, openArtifact]);

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
    qc.invalidateQueries({ queryKey: envelopeKeys.events(envelope.id) });
    qc.invalidateQueries({ queryKey: envelopeKeys.detail(envelope.id) });
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
    // Drafts: hard-delete (no signers were ever notified). Sent envelopes
    // (awaiting_others / sealing): the cancel mutation flips the status to
    // `canceled` server-side and fans out the withdrawal emails. Terminal
    // statuses don't even render the button so we don't branch for them.
    if (envelope.status === 'draft') {
      deleteEnvelope.mutate(envelope.id, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: envelopeKeys.lists() });
          navigate('/documents');
        },
        onError: (err) => {
          setToast({
            kind: 'danger',
            text: err instanceof Error ? err.message : 'Could not withdraw this envelope.',
          });
        },
      });
      return;
    }
    cancelEnvelope.mutate(envelope.id, {
      onSuccess: () => {
        // Stay on the page so the user sees the timeline pick up the
        // `canceled` event + signer status updates.
        setToast({ kind: 'success', text: 'Envelope withdrawn. Signers were notified.' });
      },
      onError: (err) => {
        setToast({
          kind: 'danger',
          text: err instanceof Error ? err.message : 'Could not withdraw this envelope.',
        });
      },
    });
  }, [envelope, deleteEnvelope, cancelEnvelope, qc, navigate]);

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
  const isComplete = envelope.status === 'completed';
  const isDeclined = envelope.status === 'declined' || envelope.status === 'expired';
  const isTerminal = TERMINAL_STATUSES.has(envelope.status);
  const hasPending = envelope.signers.some((s) => s.signed_at === null && s.declined_at === null);

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
      meta: isComplete ? 'Sealed PDF in a tab + audit downloaded' : 'Available once sealed',
      available: isComplete,
    },
    ...(gdriveEnabled
      ? [
          {
            kind: 'gdrive',
            icon: GDriveLogo,
            title: 'Save to Google Drive',
            description: 'Push the sealed PDF + audit trail into a Drive folder you pick.',
            meta: envelope.gdriveExport?.lastPushedAt
              ? `Last saved to Drive · ${formatWhen(envelope.gdriveExport.lastPushedAt)}`
              : 'Sends the sealed PDF + audit trail',
            busyMeta: 'Choosing a folder…',
            available: isComplete,
            action: 'gdrive' as const,
          } satisfies DownloadMenuItem,
        ]
      : []),
  ];
  const downloadInFlightKind = gdriveInFlight ? 'gdrive' : downloadInFlight;

  return (
    <Wrap>
      <Inner>
        {/*
          Breadcrumb shows the envelope title at the end (truncated
          with an ellipsis at 60ch) instead of the short_code — the
          short_code already appears in the status meta row below,
          so repeating it here forfeited navigation context. The title
          is the orienting bit a user wants when they glance up.
        */}
        <Breadcrumb>
          <BreadcrumbLink type="button" onClick={handleBack}>
            <ArrowLeft size={14} /> Documents
          </BreadcrumbLink>
          <span aria-hidden>/</span>
          <BreadcrumbTitle title={envelope.title}>{envelope.title}</BreadcrumbTitle>
        </Breadcrumb>

        <HeadRow>
          <HeadText>
            <Eyebrow>Envelope</Eyebrow>
            <Title>{envelope.title}</Title>
            {/*
              The header band is collapsed from 6 rows (breadcrumb,
              eyebrow, title, status, tag chips, tag input) to 4 by
              rolling the tag chips + inline "+ tag" affordance into
              the same row as the status meta. `gap: 12px` keeps the
              rhythm consistent; the row wraps naturally on narrow
              viewports.
            */}
            <HeadMeta>
              <Badge tone={STATUS_TONE[envelope.status]}>{STATUS_LABEL[envelope.status]}</Badge>
              <MetaSeparator>·</MetaSeparator>
              <HeadCode>{envelope.short_code}</HeadCode>
              {envelope.original_pages !== null ? (
                <>
                  <MetaSeparator>·</MetaSeparator>
                  <span>{envelope.original_pages} pages</span>
                </>
              ) : null}
              <MetaSeparator>·</MetaSeparator>
              <span>Sent {formatDateOnly(envelope.sent_at)}</span>
              <MetaSeparator>·</MetaSeparator>
              <HeadMetaTagSlot>
                <TagEditor
                  layout="inline"
                  value={envelope.tags ?? []}
                  onChange={(next) => handleTagsChange(next)}
                />
              </HeadMetaTagSlot>
            </HeadMeta>
          </HeadText>
          <HeadActions>
            <DownloadMenu
              items={downloadItems}
              onSelect={handleDownload}
              inFlight={downloadInFlightKind}
            />
            {/*
              Terminal envelopes (completed / declined / expired /
              canceled) have nothing left to remind anyone of — hide
              the button entirely rather than baiting a click on a
              disabled control. The disabled-with-tooltip path is
              still reachable when a non-terminal envelope happens
              to have no pending signers (a rare middle state).
            */}
            {!isTerminal ? (
              <Button
                variant="secondary"
                iconLeft={Bell}
                onClick={handleSendReminder}
                loading={remindInFlight}
                disabled={!hasPending}
                title={hasPending ? undefined : 'Every signer has already signed or declined.'}
              >
                Send reminder
              </Button>
            ) : null}
            {envelope.status === 'draft' ||
            envelope.status === 'awaiting_others' ||
            envelope.status === 'sealing' ? (
              <Button
                variant="secondary"
                iconLeft={X}
                onClick={() => setWithdrawOpen(true)}
                loading={deleteEnvelope.isPending || cancelEnvelope.isPending}
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

        {/*
          Slim progress card — headline + bar only. The previous right-
          side tri-pillar of "Signed / Waiting / Events" with serif
          numerals was non-canonical (the kit design doesn't have it)
          and duplicated information already conveyed by the headline.
          Dropping it lets the card tighten its padding without feeling
          empty.
        */}
        <ProgressCard>
          <ProgressLeft>
            <ProgressLabel>
              {signed} of {total} signed — {pct}% complete
            </ProgressLabel>
            <ProgressTrack>
              <ProgressFill $pct={pct} $complete={isComplete} $declined={isDeclined} />
            </ProgressTrack>
          </ProgressLeft>
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
                  This envelope is sealed with an eIDAS-aligned advanced electronic signature
                  (PAdES-LT). Every event is timestamped and cryptographically anchored.
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
        description={
          envelope.status === 'draft'
            ? 'This draft will be permanently removed. The action cannot be undone.'
            : `Your signer${envelope.signers.length === 1 ? '' : 's'} will be notified that the request is canceled. This cannot be undone.`
        }
        confirmLabel="Withdraw"
        cancelLabel={envelope.status === 'draft' ? 'Keep draft' : 'Keep envelope'}
        onConfirm={handleConfirmWithdraw}
        onCancel={() => setWithdrawOpen(false)}
      />
    </Wrap>
  );
}
