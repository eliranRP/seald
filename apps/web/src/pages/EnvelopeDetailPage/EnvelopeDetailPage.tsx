import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  Bell,
  CheckCircle,
  ChevronLeft,
  Clock,
  Link2,
  MoreHorizontal,
  TimerOff,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isFeatureEnabled } from 'shared';
import type { EnvelopeDocument } from 'shared';
import { Avatar } from '@/components/Avatar';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import {
  DialogBackdrop,
  DialogCard,
  DialogFooter,
  DialogTitle,
} from '@/components/DialogPrimitives';
import { InfoChip } from '@/components/InfoChip';
import { Menu, MenuAnchor } from '@/components/Menu';
import type { MenuEntry } from '@/components/Menu';
import { MWBottomSheet } from '@/components/MWBottomSheet';
import { Skeleton } from '@/components/Skeleton';
import { StatusBadge } from '@/components/StatusBadge';
import type { EnvelopeBadgeStatus } from '@/components/StatusBadge';
import { Switch } from '@/components/Switch';
import { TagEditor } from '@/components/TagEditor';
import { Toast } from '@/components/Toast';
import {
  EnvelopeDocumentsCard,
  moveItem,
  useRemoveEnvelopeDocumentMutation,
  useReorderEnvelopeDocumentsMutation,
} from '@/features/documentEditor/documents';
import {
  envelopeKeys,
  fixEnvelopeSigner,
  getEnvelopeDownloadUrl,
  remindEnvelopeSigner,
  replaceEnvelopeSigner,
  useEnvelopeEventsQuery,
  useEnvelopeQuery,
} from '@/features/envelopes';
import type { Envelope, EnvelopeSigner } from '@/features/envelopes';
import { patchEnvelope } from '@/features/envelopes/envelopesApi';
import {
  useCancelEnvelopeMutation,
  useDeleteEnvelopeMutation,
} from '@/features/envelopes/useEnvelopes';
import { ReviewPlacement } from '@/features/agentActivity';
import { useSaveEnvelopeToGdrive } from '@/features/gdriveExport';
import { SigningOrderSteps } from '@/features/signers/signingOrder';
import { useReminderToggle } from '@/hooks/useReminderToggle';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { useFocusedShell } from '@/layout/shellChrome';
import { formatShortDate, formatShortDateOrDash } from '@/lib/dateFormat';
import { ActivityCard } from './ActivityCard';
import { DownloadSplitButton } from './DownloadSplitButton';
import type { DownloadKind } from './DownloadSplitButton';
import { ReplaceSignerDialog } from './ReplaceSignerDialog';
import { SignersCard } from './SignersCard';
import { TERMINAL_STATUSES, activityRows, isPending } from './envelopeView';
import {
  Anchor,
  Bar,
  BarFill,
  BackRow,
  Card,
  Center,
  ChipsRow,
  DesktopOnly,
  HeadActions,
  HeadCode,
  HeadMeta,
  HeadRow,
  HeadText,
  Inner,
  MobileBar,
  MobileTop,
  MobileTopTitle,
  Muted,
  NotFoundHint,
  SheetList,
  SkelLines,
  SkelRow,
  SkelStack,
  SummaryCard,
  SummaryLead,
  SummaryNum,
  SummaryOk,
  Title,
  WithdrawIcon,
  Wrap,
  ChipLink,
} from './EnvelopeDetailPage.styles';

/**
 * The mobile board gives this page its own header and action bar, so the
 * app top bar and bottom nav step aside while it is open on a phone.
 */
function FocusedOnMobile() {
  useFocusedShell();
  return null;
}

interface ActionToast {
  readonly kind: 'success' | 'danger';
  readonly text: string;
}

const TOAST_MS = 4000;

function badgeFor(
  envelope: Envelope,
  pending: number,
): { status: EnvelopeBadgeStatus; label?: string } {
  switch (envelope.status) {
    case 'awaiting_others':
      return { status: 'others', label: pending > 0 ? `Waiting on ${pending}` : 'Waiting' };
    case 'sealing':
      return { status: 'sealing' };
    case 'completed':
      return { status: 'sealed' };
    case 'declined':
      return { status: 'declined' };
    case 'expired':
      return { status: 'expired' };
    case 'canceled':
      return { status: 'canceled', label: 'Withdrawn' };
    default:
      return { status: 'draft' };
  }
}

/** Board: green once everyone signed (sealing, sealed), grey when withdrawn, indigo otherwise. */
function barToneFor(status: Envelope['status']): 'ok' | 'muted' | 'base' {
  if (status === 'completed' || status === 'sealing') return 'ok';
  if (status === 'canceled') return 'muted';
  return 'base';
}

function isThrottled(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const status = (err as { response?: { status?: number } }).response?.status;
  return status === 429;
}

/**
 * Sent-envelope detail. The signer tracker is the hero: one row per signer
 * with a Sent, Opened, Signed track and its actions (Remind, Fix email,
 * Replace signer). Below it the activity log, with the audit chain verdict.
 *
 * Header actions: Remind all, a Download split button (sealed PDF + audit
 * trail once sealed; the original before), and a More menu (Withdraw).
 * Withdraw on a sent envelope calls `POST /envelopes/:id/cancel`; a draft is
 * deleted. On phones the actions move to a sticky bar and menus become sheets.
 */
export function EnvelopeDetailPage() {
  const { id } = useParams<{ readonly id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobileViewport();
  const q = useEnvelopeQuery(id ?? '', Boolean(id));
  const ev = useEnvelopeEventsQuery(id ?? '', Boolean(id));
  const deleteEnvelope = useDeleteEnvelopeMutation();
  const cancelEnvelope = useCancelEnvelopeMutation();
  const gdriveEnabled = isFeatureEnabled('gdriveIntegration');
  const { save: saveToGdrive, inFlight: gdriveInFlight } = useSaveEnvelopeToGdrive();

  const [toast, setToast] = useState<ActionToast | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [remindAllBusy, setRemindAllBusy] = useState(false);
  const [remindBusyId, setRemindBusyId] = useState<string | null>(null);
  const [reminded, setReminded] = useState<ReadonlySet<string>>(new Set());
  const [downloadInFlight, setDownloadInFlight] = useState<string | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixBusy, setFixBusy] = useState(false);
  const [replacing, setReplacing] = useState<EnvelopeSigner | null>(null);
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement | null>(null);

  const envelope = q.data;
  const events = useMemo(() => ev.data?.events ?? [], [ev.data]);
  const chainIntact = ev.data?.chain_intact ?? null;
  const rows = useMemo(() => (envelope ? activityRows(envelope, events) : []), [envelope, events]);

  const handleBack = useCallback(() => navigate('/documents'), [navigate]);
  const showError = useCallback((text: string) => setToast({ kind: 'danger', text }), []);
  const showOk = useCallback((text: string) => setToast({ kind: 'success', text }), []);

  const reminders = useReminderToggle({
    sourceKey: envelope?.id,
    enabled: envelope ? envelope.reminders_enabled !== false : false,
    onChange: (enabled) => {
      if (!envelope) return undefined;
      return (async () => {
        try {
          await patchEnvelope(envelope.id, { reminders_enabled: enabled });
          await qc.invalidateQueries({ queryKey: envelopeKeys.detail(envelope.id) });
        } catch {
          showError('Could not update reminders.');
          throw new Error('reminders_update_failed');
        }
      })();
    },
  });

  // Tag edits are best-effort: the editor shows the new chips at once, we
  // PATCH in the background and refresh the detail + list queries.
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
        showError(err instanceof Error ? err.message : 'Failed to update tags.');
      }
    },
    [envelope, qc, showError],
  );

  // Shared fetch + open-in-new-tab flow for every PDF artifact. The window is
  // opened synchronously from the click so popup blockers treat it as
  // user-initiated, then pointed at the signed URL once the API answers.
  const openArtifact = useCallback(
    async (
      kind: 'sealed' | 'original' | 'audit' | undefined,
      friendly: string,
      multi?: { readonly documentId?: string; readonly zip?: boolean },
    ): Promise<void> => {
      if (!envelope) return;
      const win = window.open('about:blank', '_blank');
      try {
        const { url } =
          multi === undefined
            ? await getEnvelopeDownloadUrl(envelope.id, kind)
            : await getEnvelopeDownloadUrl(envelope.id, kind, undefined, multi);
        if (win && !win.closed) {
          try {
            win.opener = null;
          } catch {
            /* cross-origin after navigation, ignore. */
          }
          win.location.href = url;
          showOk(`${friendly} opened in a new tab.`);
        } else {
          // Popup blocked: an anchor click keeps this tab on the page.
          const a = document.createElement('a');
          a.href = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          document.body.appendChild(a);
          a.click();
          a.remove();
          showOk(`${friendly} ready. Allow popups for this site if nothing opened.`);
        }
      } catch (err) {
        if (win && !win.closed) win.close();
        const msg = err instanceof Error ? err.message : 'Download failed.';
        showError(
          /file_not_ready/.test(msg)
            ? `The ${friendly.toLowerCase()} has not been produced for this envelope yet.`
            : msg,
        );
      }
    },
    [envelope, showError, showOk],
  );

  const handleSaveToGdrive = useCallback(async () => {
    if (!envelope) return;
    setToast(null);
    const outcome = await saveToGdrive(envelope);
    switch (outcome.kind) {
      case 'saved':
        showOk('Saved to Google Drive. The sealed PDF + audit trail are in your folder.');
        break;
      case 'partial':
        showError('Sealed PDF saved to Drive; the audit trail upload failed. Try again.');
        break;
      case 'canceled':
        break;
      case 'connect-needed':
        showError('Connect a Google Drive account to save here, then try again.');
        break;
      case 'reconnect-needed':
        showError('Your Google Drive connection expired. Reconnect it, then try again.');
        break;
      case 'not-sealed':
        showError("This envelope isn't sealed yet, so there's nothing to save.");
        break;
      case 'permission-denied':
        showError("Couldn't write to that folder. Pick another one and try again.");
        break;
      case 'rate-limited':
        showError(`Too many Drive requests. Try again in ${outcome.retryAfterSeconds}s.`);
        break;
      case 'picker-not-configured':
        showError('The Google Drive picker is not configured on this server.');
        break;
      case 'error':
        showError(outcome.message || 'Saving to Google Drive failed.');
        break;
      default: {
        const _exhaustive: never = outcome;
        void _exhaustive;
      }
    }
  }, [envelope, saveToGdrive, showError, showOk]);

  const handleDownload = useCallback(
    async (kind: DownloadKind) => {
      if (!envelope) return;
      if (kind === 'gdrive') {
        await handleSaveToGdrive();
        return;
      }
      setDownloadInFlight(kind);
      setToast(null);
      try {
        if (kind === 'zip') {
          await openArtifact(undefined, 'Documents zip', { zip: true });
        } else if (kind === 'bundle') {
          // The sealed PDF opens in a tab (one user-gesture window) and the
          // audit trail downloads as an anchor on this page, so there is no
          // second window for a popup blocker to catch.
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
            auditAnchor.download = `audit-${envelope.id}.pdf`;
            auditAnchor.rel = 'noopener noreferrer';
            document.body.appendChild(auditAnchor);
            auditAnchor.click();
            auditAnchor.remove();
            showOk('Sealed PDF opened in a new tab; audit trail downloaded.');
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Download failed.';
            showError(
              /file_not_ready/.test(msg) ? 'The sealed artifacts have not been produced yet.' : msg,
            );
          }
        } else if (kind === 'sealed') {
          await openArtifact('sealed', 'Sealed PDF');
        } else if (kind === 'audit') {
          await openArtifact('audit', 'Audit trail');
        } else {
          await openArtifact('original', 'Original PDF');
        }
      } finally {
        setDownloadInFlight(null);
      }
    },
    [envelope, openArtifact, handleSaveToGdrive, showError, showOk],
  );

  // Per-document download (multi-document envelopes): the sealed PDF once sealed, else the original.
  const handleDownloadDocument = useCallback(
    async (d: EnvelopeDocument) => {
      if (!envelope) return;
      setDownloadInFlight(d.id);
      setToast(null);
      try {
        const sealed = envelope.status === 'completed';
        await openArtifact(sealed ? 'sealed' : 'original', d.title, { documentId: d.id });
      } finally {
        setDownloadInFlight(null);
      }
    },
    [envelope, openArtifact],
  );

  const reorderDocuments = useReorderEnvelopeDocumentsMutation(id ?? '');
  const removeDocument = useRemoveEnvelopeDocumentMutation(id ?? '');
  const handleMoveDocument = useCallback(
    (docId: string, direction: 'up' | 'down') => {
      const list = envelope?.documents;
      if (!list) return;
      const from = list.findIndex((d) => d.id === docId);
      const next = moveItem(list, from, direction === 'up' ? from - 1 : from + 1);
      reorderDocuments.mutate(
        next.map((d) => d.id),
        { onError: () => showError('Could not reorder the documents. Please try again.') },
      );
    },
    [envelope?.documents, reorderDocuments, showError],
  );
  const handleRemoveDocument = useCallback(
    (docId: string) => {
      removeDocument.mutate(docId, {
        onError: () => showError('Could not remove the document. Please try again.'),
      });
    },
    [removeDocument, showError],
  );

  const refreshEnvelope = useCallback(() => {
    if (!envelope) return;
    void qc.invalidateQueries({ queryKey: envelopeKeys.events(envelope.id) });
    void qc.invalidateQueries({ queryKey: envelopeKeys.detail(envelope.id) });
  }, [envelope, qc]);

  const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

  // One signer. The server allows one reminder per signer per hour: a 429
  // reads as "Reminded", not as an error.
  const handleRemindOne = useCallback(
    async (signer: EnvelopeSigner) => {
      if (!envelope) return;
      setRemindBusyId(signer.id);
      setToast(null);
      try {
        await remindEnvelopeSigner(envelope.id, signer.id);
        setReminded((prev) => new Set(prev).add(signer.id));
        showOk(`Reminded ${firstName(signer.name)}`);
        refreshEnvelope();
      } catch (err) {
        if (isThrottled(err)) {
          setReminded((prev) => new Set(prev).add(signer.id));
          showOk(`${firstName(signer.name)} was reminded in the last hour`);
        } else {
          showError('Could not send the reminder. Please try again.');
        }
      } finally {
        setRemindBusyId(null);
      }
    },
    [envelope, refreshEnvelope, showError, showOk],
  );

  const handleRemindAll = useCallback(async () => {
    if (!envelope) return;
    const pending = envelope.signers.filter(isPending);
    if (pending.length === 0) return;
    setRemindAllBusy(true);
    setToast(null);
    const results = await Promise.allSettled(
      pending.map((s) => remindEnvelopeSigner(envelope.id, s.id)),
    );
    setRemindAllBusy(false);
    const done = new Set(reminded);
    let sent = 0;
    let throttled = 0;
    let failed = 0;
    results.forEach((r, index) => {
      const signer = pending[index];
      if (!signer) return;
      if (r.status === 'fulfilled') {
        sent += 1;
        done.add(signer.id);
      } else if (isThrottled(r.reason)) {
        throttled += 1;
        done.add(signer.id);
      } else {
        failed += 1;
      }
    });
    setReminded(done);
    refreshEnvelope();
    if (failed > 0 && sent === 0 && throttled === 0) {
      showError('Could not send the reminders. Please try again.');
    } else if (sent === 0 && failed === 0) {
      showOk('Reminded in the last hour');
    } else if (throttled > 0 || failed > 0) {
      showOk(`${sent} sent · ${throttled + failed} throttled`);
    } else {
      showOk(sent === 1 ? 'Reminded 1 signer' : `Reminded ${sent} signers`);
    }
  }, [envelope, reminded, refreshEnvelope, showError, showOk]);

  const handleFixSubmit = useCallback(
    async (signer: EnvelopeSigner, email: string) => {
      if (!envelope) return;
      setFixBusy(true);
      try {
        await fixEnvelopeSigner(envelope.id, signer.id, { email });
        setFixingId(null);
        setReminded((prev) => {
          const next = new Set(prev);
          next.delete(signer.id);
          return next;
        });
        showOk(`Sent to ${email}`);
        refreshEnvelope();
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        showError(
          /signer_email_taken/.test(msg)
            ? 'That email is already on this envelope.'
            : 'Could not update the email. Please try again.',
        );
      } finally {
        setFixBusy(false);
      }
    },
    [envelope, refreshEnvelope, showError, showOk],
  );

  const handleReplace = useCallback(
    async (next: { readonly name: string; readonly email: string }) => {
      if (!envelope || !replacing) return;
      setReplaceBusy(true);
      try {
        await replaceEnvelopeSigner(envelope.id, replacing.id, next);
        setReplacing(null);
        setReminded((prev) => {
          const copy = new Set(prev);
          copy.delete(replacing.id);
          return copy;
        });
        showOk(`Sent to ${next.email}`);
        refreshEnvelope();
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        showError(
          /signer_email_taken/.test(msg)
            ? 'That email is already on this envelope.'
            : 'Could not replace the signer. Please try again.',
        );
      } finally {
        setReplaceBusy(false);
      }
    },
    [envelope, replacing, refreshEnvelope, showError, showOk],
  );

  const handleConfirmWithdraw = useCallback(() => {
    if (!envelope) return;
    setWithdrawOpen(false);
    // Drafts: hard-delete (nobody was notified). Sent envelopes: the cancel
    // mutation flips the status server-side and fans out the cancel emails.
    if (envelope.status === 'draft') {
      deleteEnvelope.mutate(envelope.id, {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: envelopeKeys.lists() });
          navigate('/documents');
        },
        onError: (err) => {
          showError(err instanceof Error ? err.message : 'Could not withdraw this envelope.');
        },
      });
      return;
    }
    cancelEnvelope.mutate(envelope.id, {
      onSuccess: () => showOk('Envelope withdrawn. Signers were notified.'),
      onError: (err) => {
        showError(err instanceof Error ? err.message : 'Could not withdraw this envelope.');
      },
    });
  }, [envelope, deleteEnvelope, cancelEnvelope, qc, navigate, showError, showOk]);

  const mobileTop = (title: string, more: boolean) => (
    <MobileTop>
      <Button
        variant="ghost"
        iconOnly
        iconLeft={ChevronLeft}
        aria-label="Back to documents"
        onClick={handleBack}
      />
      <MobileTopTitle>{title}</MobileTopTitle>
      {more ? (
        <Button
          variant="ghost"
          iconOnly
          iconLeft={MoreHorizontal}
          aria-label="More"
          onClick={() => setMoreOpen(true)}
        />
      ) : null}
    </MobileTop>
  );

  if (q.isPending) {
    return (
      <Wrap>
        {isMobile ? <FocusedOnMobile /> : null}
        {mobileTop('', false)}
        <Inner aria-busy="true">
          <Skeleton width={320} height={36} />
          <SkelRow>
            <Skeleton width={90} height={24} />
            <Skeleton width={70} height={14} />
            <Skeleton width={90} height={14} />
          </SkelRow>
          <Skeleton height={72} />
          <Card>
            <SkelStack>
              {[0, 1, 2].map((n) => (
                <SkelRow key={n}>
                  <Skeleton variant="circle" width={36} height={36} />
                  <SkelLines>
                    <Skeleton width="40%" height={12} />
                    <Skeleton width="28%" height={10} />
                  </SkelLines>
                  <Skeleton width={132} height={12} />
                </SkelRow>
              ))}
            </SkelStack>
          </Card>
          <Card>
            <SkelStack>
              {[30, 70, 60, 66].map((w) => (
                <Skeleton key={w} width={`${w}%`} height={12} />
              ))}
            </SkelStack>
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
            <Button variant="primary" iconLeft={ArrowLeft} onClick={handleBack}>
              Back to documents
            </Button>
          </Card>
        </Inner>
      </Wrap>
    );
  }

  const total = envelope.signers.length;
  const signed = envelope.signers.filter((s) => s.status === 'completed').length;
  const pendingCount = envelope.signers.filter(isPending).length;
  const isComplete = envelope.status === 'completed';
  const isSealing = envelope.status === 'sealing';
  const isTerminal = TERMINAL_STATUSES.has(envelope.status);
  const isLive = envelope.status === 'awaiting_others';
  const barTone = barToneFor(envelope.status);
  const pct = total === 0 ? 0 : Math.round((signed / total) * 100);
  const bounced = envelope.signers.find((s) => s.status === 'bounced') ?? null;
  const badge = badgeFor(envelope, pendingCount);
  const canWithdraw = ['draft', 'awaiting_others', 'sealing'].includes(envelope.status);
  const showRemindAll = isLive && pendingCount > 0;
  const envelopeDocuments = envelope.documents ?? [];
  const multiDoc = isFeatureEnabled('multiDocumentEnvelopes') && envelopeDocuments.length > 1;
  const downloadBusy = gdriveInFlight ? 'gdrive' : downloadInFlight;
  const pendingNames = envelope.signers.filter(isPending);
  const reminderDays = envelope.reminder_interval_days;
  const autoLabel =
    reminderDays !== undefined
      ? `Auto-remind · ${reminderDays} day${reminderDays === 1 ? '' : 's'}`
      : 'Auto-remind';
  const expiresText = formatShortDate(envelope.expires_at);

  const moreEntries: MenuEntry[] = canWithdraw
    ? [
        {
          id: 'withdraw',
          label: 'Withdraw',
          icon: Ban,
          danger: true,
          onSelect: () => setWithdrawOpen(true),
        },
      ]
    : [];

  const downloadButton = (fullWidth?: boolean) => (
    <DownloadSplitButton
      sealed={isComplete}
      sealing={isSealing}
      originalAvailable={envelope.original_pages !== null}
      gdriveEnabled={gdriveEnabled}
      multiDoc={multiDoc}
      busy={downloadBusy}
      fullWidth={fullWidth}
      gdriveLastSaved={
        envelope.gdriveExport?.lastPushedAt
          ? `Saved ${formatShortDate(envelope.gdriveExport.lastPushedAt)}`
          : null
      }
      onSelect={(kind) => {
        void handleDownload(kind);
      }}
    />
  );

  // Desktop: secondary in the header. Mobile: the bar's primary action.
  const remindAllButton = (primary?: boolean) =>
    showRemindAll ? (
      <Button
        variant={primary === true ? 'primary' : 'secondary'}
        iconLeft={Bell}
        loading={remindAllBusy}
        onClick={() => {
          void handleRemindAll();
        }}
      >
        Remind all
      </Button>
    ) : null;

  return (
    <Wrap>
      {isMobile ? <FocusedOnMobile /> : null}
      {mobileTop(envelope.title, moreEntries.length > 0)}
      <Inner>
        <BackRow>
          <Button variant="ghost" size="sm" iconLeft={ChevronLeft} onClick={handleBack}>
            Documents
          </Button>
        </BackRow>

        {bounced !== null ? (
          <Banner
            tone="error"
            action={
              <Button size="sm" onClick={() => setFixingId(bounced.id)}>
                Fix email
              </Button>
            }
          >
            {`Email to ${firstName(bounced.name)} bounced`}
          </Banner>
        ) : null}

        <HeadRow>
          <HeadText>
            <Title>{envelope.title}</Title>
            <HeadMeta>
              <StatusBadge status={badge.status} {...(badge.label ? { label: badge.label } : {})} />
              <HeadCode>{envelope.short_code}</HeadCode>
              {envelope.original_pages !== null ? (
                <DesktopOnly>{envelope.original_pages} pages</DesktopOnly>
              ) : null}
              <span>Sent {formatShortDateOrDash(envelope.sent_at)}</span>
              <TagEditor
                layout="inline"
                value={envelope.tags ?? []}
                onChange={(next) => handleTagsChange(next)}
              />
            </HeadMeta>
          </HeadText>
          <HeadActions>
            {/* A draft an agent prepared: walk its fields, then send or edit. Draft only, flag gated. */}
            <ReviewPlacement envelope={envelope} onSent={() => showOk('Sent for signature.')} />
            {remindAllButton()}
            {downloadButton()}
            {moreEntries.length > 0 ? (
              <MenuAnchor>
                <Button
                  ref={moreRef}
                  variant="secondary"
                  iconOnly
                  iconLeft={MoreHorizontal}
                  aria-label="More"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  loading={deleteEnvelope.isPending || cancelEnvelope.isPending}
                  onClick={() => setMoreOpen((v) => !v)}
                />
                {!isMobile ? (
                  <Menu
                    open={moreOpen}
                    onClose={() => setMoreOpen(false)}
                    items={moreEntries}
                    anchorRef={moreRef}
                    aria-label="More actions"
                  />
                ) : null}
              </MenuAnchor>
            ) : null}
          </HeadActions>
        </HeadRow>

        <SummaryCard aria-label="Progress">
          {isComplete ? (
            <SummaryOk>
              <CheckCircle size={24} aria-hidden />
              {`Sealed ${formatShortDate(envelope.completed_at ?? envelope.updated_at)} · ${signed} / ${total} signed`}
            </SummaryOk>
          ) : (
            <SummaryLead>
              <SummaryNum>{`${signed} / ${total}`}</SummaryNum>
              <Muted>signed</Muted>
            </SummaryLead>
          )}
          <Bar
            role="progressbar"
            aria-label="Signed"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={signed}
          >
            <BarFill $pct={pct} $tone={barTone} />
          </Bar>
          <ChipsRow>
            {isLive || envelope.status === 'declined' ? (
              <InfoChip icon={Clock}>{`Expires ${expiresText}`}</InfoChip>
            ) : null}
            {envelope.status === 'expired' ? (
              <InfoChip icon={TimerOff}>{`Expired ${expiresText}`}</InfoChip>
            ) : null}
            {isComplete ? (
              <ChipLink href={`/verify/${envelope.short_code}`}>
                <InfoChip icon={Link2}>Verify page</InfoChip>
              </ChipLink>
            ) : null}
            {isLive || envelope.status === 'draft' ? (
              <InfoChip icon={Bell}>
                {autoLabel}
                <Switch
                  label="Auto-remind"
                  checked={reminders.enabled}
                  pending={reminders.pending}
                  onChange={reminders.onChange}
                />
              </InfoChip>
            ) : null}
          </ChipsRow>
        </SummaryCard>

        {multiDoc ? (
          <EnvelopeDocumentsCard
            documents={envelopeDocuments}
            sealed={isComplete}
            busyId={downloadInFlight}
            onDownload={(d) => {
              handleDownloadDocument(d).catch(() => {
                /* surfaced via the toast inside openArtifact */
              });
            }}
            onDownloadAll={() => {
              void handleDownload('zip');
            }}
            {...(envelope.status === 'draft'
              ? { onMove: handleMoveDocument, onRemove: handleRemoveDocument }
              : {})}
          />
        ) : null}

        <SignersCard
          envelope={envelope}
          remindedIds={reminded}
          fixingId={fixingId}
          busyId={fixBusy && fixingId !== null ? fixingId : remindBusyId}
          onRemind={(s) => {
            void handleRemindOne(s);
          }}
          onFixOpen={(s) => setFixingId(s.id)}
          onFixCancel={() => setFixingId(null)}
          onFixSubmit={(s, email) => {
            void handleFixSubmit(s, email);
          }}
          onReplace={(s) => setReplacing(s)}
        />

        <SigningOrderSteps
          deliveryMode={envelope.delivery_mode}
          signers={envelope.signers}
          sent={envelope.status !== 'draft'}
        />

        <ActivityCard rows={rows} chainIntact={isTerminal || isLive ? chainIntact : null} />
      </Inner>

      {/* Mobile: Download takes one share, the primary action (Remind all) two. */}
      <MobileBar>
        <Anchor>{downloadButton(true)}</Anchor>
        {remindAllButton(true)}
      </MobileBar>

      {isMobile ? (
        <MWBottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
          <SheetList>
            {moreEntries.map((entry) =>
              entry.type === undefined || entry.type === 'item' ? (
                <Button
                  key={entry.id}
                  variant="ghost"
                  size="lg"
                  fullWidth
                  iconLeft={entry.icon}
                  onClick={() => {
                    setMoreOpen(false);
                    entry.onSelect();
                  }}
                >
                  {entry.label}
                </Button>
              ) : null,
            )}
          </SheetList>
        </MWBottomSheet>
      ) : null}

      <ReplaceSignerDialog
        signer={replacing}
        takenEmails={envelope.signers.map((s) => s.email)}
        busy={replaceBusy}
        onCancel={() => setReplacing(null)}
        onReplace={(next) => {
          void handleReplace(next);
        }}
      />

      {withdrawOpen ? (
        <DialogBackdrop role="presentation" onClick={() => setWithdrawOpen(false)}>
          <DialogCard
            role="alertdialog"
            aria-modal="true"
            aria-label="Withdraw envelope"
            onClick={(e) => e.stopPropagation()}
          >
            <Center>
              <WithdrawIcon>
                <Ban size={24} aria-hidden />
              </WithdrawIcon>
              <DialogTitle>Withdraw this envelope?</DialogTitle>
              {envelope.status === 'draft' ? (
                <Muted>This draft will be removed.</Muted>
              ) : (
                <>
                  <ChipsRow style={{ justifyContent: 'center' }}>
                    {envelope.signers.slice(0, 5).map((s) => (
                      <Avatar key={s.id} name={s.name} size={32} />
                    ))}
                  </ChipsRow>
                  <Muted>
                    {`${pendingNames.length} signer${pendingNames.length === 1 ? '' : 's'} get a cancel email`}
                  </Muted>
                </>
              )}
            </Center>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>
                Keep
              </Button>
              <Button variant="danger" onClick={handleConfirmWithdraw} autoFocus>
                Withdraw
              </Button>
            </DialogFooter>
          </DialogCard>
        </DialogBackdrop>
      ) : null}

      {toast !== null ? (
        <Toast
          title={toast.text}
          tone={toast.kind === 'danger' ? 'error' : 'success'}
          duration={TOAST_MS}
          onClose={() => setToast(null)}
        />
      ) : null}
    </Wrap>
  );
}
