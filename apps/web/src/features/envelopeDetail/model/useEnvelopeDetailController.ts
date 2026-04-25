import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ENVELOPES_KEY,
  ENVELOPE_EVENTS_KEY,
  ENVELOPE_KEY,
  getEnvelopeDownloadUrl,
  remindEnvelopeSigner,
} from '@/features/envelopes';
import { useDeleteEnvelopeMutation } from '@/features/envelopes/useEnvelopes';
import type { Envelope } from '@/features/envelopes';

export interface ActionToast {
  readonly kind: 'success' | 'danger';
  readonly text: string;
}

type ArtifactKind = 'sealed' | 'original' | 'audit';

interface UseEnvelopeDetailControllerArgs {
  readonly envelope: Envelope | undefined;
}

interface UseEnvelopeDetailControllerReturn {
  readonly toast: ActionToast | null;
  readonly withdrawOpen: boolean;
  readonly remindInFlight: boolean;
  readonly downloadInFlight: string | null;
  readonly auditInFlight: boolean;
  readonly deleteIsPending: boolean;
  readonly handleBack: () => void;
  readonly openWithdraw: () => void;
  readonly closeWithdraw: () => void;
  readonly handleDownload: (kind: string) => Promise<void>;
  readonly handleViewAudit: () => Promise<void>;
  readonly handleSendReminder: () => Promise<void>;
  readonly handleConfirmWithdraw: () => void;
}

/**
 * Owns the full set of mutating interactions on the envelope detail page —
 * downloads, reminders, withdraw — plus the supporting transient state
 * (toast, in-flight flags, withdraw dialog open).
 *
 * The page provides only the loaded envelope; everything else (navigation,
 * react-query client, mutations, downloads API) is wired in here so the
 * page render stays declarative.
 */
export function useEnvelopeDetailController({
  envelope,
}: UseEnvelopeDetailControllerArgs): UseEnvelopeDetailControllerReturn {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const deleteEnvelope = useDeleteEnvelopeMutation();

  const [toast, setToast] = useState<ActionToast | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [remindInFlight, setRemindInFlight] = useState(false);
  const [downloadInFlight, setDownloadInFlight] = useState<string | null>(null);
  const [auditInFlight, setAuditInFlight] = useState(false);

  const handleBack = useCallback(() => navigate('/documents'), [navigate]);

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
    async (kind: ArtifactKind | undefined, friendly: string): Promise<void> => {
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
          // Popup blocked. Fall back to an anchor-element click, which keeps
          // the current tab on the page and (for browsers that preview PDFs
          // inline) opens the download in a new tab via `target="_blank"`.
          // This is the safest fallback that never hijacks the current tab.
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

  const handleDownload = useCallback(
    async (kind: string): Promise<void> => {
      if (!envelope) return;
      if (kind !== 'sealed' && kind !== 'original' && kind !== 'audit' && kind !== 'bundle') {
        return;
      }
      setDownloadInFlight(kind);
      setToast(null);
      try {
        if (kind === 'bundle') {
          // No server-side zip bundler yet — fire sealed + audit in parallel
          // and anchor-click each URL into its own new tab. Anchor clicks
          // don't need a synchronously-opened stub tab, so popup blockers
          // don't fire on the second one.
          try {
            const [sealed, audit] = await Promise.all([
              getEnvelopeDownloadUrl(envelope.id, 'sealed'),
              getEnvelopeDownloadUrl(envelope.id, 'audit'),
            ]);
            for (const { url } of [sealed, audit]) {
              const a = document.createElement('a');
              a.href = url;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              document.body.appendChild(a);
              a.click();
              a.remove();
            }
            setToast({
              kind: 'success',
              text: 'Sealed PDF and audit trail opened in new tabs.',
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
    [envelope, openArtifact],
  );

  const handleViewAudit = useCallback(async (): Promise<void> => {
    if (!envelope) return;
    setAuditInFlight(true);
    setToast(null);
    try {
      await openArtifact('audit', 'Audit trail');
    } finally {
      setAuditInFlight(false);
    }
  }, [envelope, openArtifact]);

  const handleSendReminder = useCallback(async (): Promise<void> => {
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

  const openWithdraw = useCallback(() => setWithdrawOpen(true), []);
  const closeWithdraw = useCallback(() => setWithdrawOpen(false), []);

  const handleConfirmWithdraw = useCallback((): void => {
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

  return {
    toast,
    withdrawOpen,
    remindInFlight,
    downloadInFlight,
    auditInFlight,
    deleteIsPending: deleteEnvelope.isPending,
    handleBack,
    openWithdraw,
    closeWithdraw,
    handleDownload,
    handleViewAudit,
    handleSendReminder,
    handleConfirmWithdraw,
  };
}
