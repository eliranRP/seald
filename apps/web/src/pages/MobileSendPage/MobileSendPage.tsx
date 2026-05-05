import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Send } from 'lucide-react';
import { isFeatureEnabled } from 'shared';
import { MobileDrivePicker } from '@/components/mobile/MobileDrivePicker';
import { useGDriveAccounts } from '@/routes/settings/integrations/useGDriveAccounts';
import {
  Shell,
  Scroller,
  StickyBar,
  PrimaryBtn,
  SecondaryBtn,
  ErrorBanner,
} from './MobileSendPage.styles';
import { MWStep } from './components/MWStep';
import { MWAddSignerSheet } from './components/MWAddSignerSheet';
import { MWApplyPagesSheet } from './components/MWApplyPagesSheet';
import { MWAssignSignersSheet } from './components/MWAssignSignersSheet';
import { MWMobileNav } from './components/MWMobileNav';
import { MWStart } from './screens/MWStart';
import { MWFile } from './screens/MWFile';
import { MWSigners } from './screens/MWSigners';
import { MWPlace } from './screens/MWPlace';
import { MWReview } from './screens/MWReview';
import { MWSent } from './screens/MWSent';
import {
  applyPagesToSelection,
  assignSignersToSelection,
  buildDroppedField,
  commitDrag,
  deleteFields,
  MOBILE_STEP_ORDER,
  toggleSelection,
  type CanvasBounds,
} from './model';
import {
  initialsFromName,
  type MobileApplyMode,
  type MobileFieldType,
  type MobilePlacedField,
  type MobileSigner,
  type MobileStep,
} from './types';
import { useAuth } from '@/providers/AuthProvider';
import { useAppState } from '@/providers/AppStateProvider';
import { useDownloadPdf } from '@/features/downloadPdf';
import { usePdfDocument } from '@/lib/pdf';
import { imageFileToPdf } from '@/utils/imageToPdf';
// QA-2026-05-02: hard cap on the upload boundary. pdf.js will happily try
// to parse a 200 MB blob on a phone and either OOM the tab or hang the
// worker for tens of seconds — neither is recoverable from the page.
const MAX_PDF_BYTES = 25 * 1024 * 1024;
import { useSendEnvelope } from '@/features/envelopes/useSendEnvelope';
import type { SendEnvelopeSignerInput } from '@/features/envelopes/useSendEnvelope';
import type { FieldPlacement } from '@/features/envelopes/envelopesApi';
import { SIGNER_COLOR_PALETTE } from '@/lib/mockApi';

const STEP_LABELS: Readonly<Record<MobileStep, string>> = {
  start: 'Pick your starting point',
  file: 'Confirm the file',
  signers: 'Who is signing?',
  place: 'Place the fields',
  review: 'Review & send',
  sent: 'All done',
};

interface SignerInput {
  readonly name: string;
  readonly email: string;
}

const FIELD_TYPE_TO_API: Readonly<Record<MobileFieldType, FieldPlacement['kind']>> = {
  sig: 'signature',
  ini: 'initials',
  dat: 'date',
  txt: 'text',
  chk: 'checkbox',
};

/**
 * Mobile-web sender flow. Six steps: start → file → signers → place →
 * review → sent. Wires uploads through the existing `usePdfDocument`
 * (page count) and `useSendEnvelope` (POST /envelopes + upload + signers
 * + fields + send) so the mobile flow shares the desktop's backend
 * contract — no new server endpoints required.
 *
 * The page is intentionally rendered without `<AppShell />` chrome (the
 * desktop nav bar would dominate a 375 px viewport); the mobile flow has
 * its own stepper + sticky CTA.
 */
// API base URL for full-page OAuth redirect. iOS Safari's popup blocker
// silently swallows `window.open()` outside a synchronous user gesture
// chain, so the mobile flow uses a top-level navigation. Pulled at
// module-init from Vite's env (rule 3.2: no `any`).
const GDRIVE_API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

export function MobileSendPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // QA-2026-05-02 (Bug 2): pull `session` so the "Add me as signer" toggle
  // also works for anonymous Supabase sessions. `useAuth().user` is `null`
  // for anon sessions on purpose (NavBar, AppState gate on it), but the
  // mobile flow's "add me" toggle should still work for guests — they're
  // signed in, just not under a named account.
  const { user, session, signOut } = useAuth();
  const { contacts } = useAppState();
  const { run: runSend, phase: sendPhase, error: sendError } = useSendEnvelope();

  // Sign-out delegated from MWMobileNav. We always land on /signin
  // (replace history) so the back button doesn't return the user to a
  // now-403 authed surface — same contract as AppShell.handleSignOut.
  const handleNavSignOut = useCallback((): void => {
    signOut()
      .catch(() => {
        /* AuthProvider already exposes the error; RequireAuth bounces to /signin */
      })
      .finally(() => navigate('/signin', { replace: true }));
  }, [signOut, navigate]);

  const [step, setStep] = useState<MobileStep>('start');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // QA-2026-05-02 (Bug 1): consume `doc` too — wired to MWFile (preview
  // thumbnail) and MWPlace (real page background) so the user sees their
  // actual PDF instead of fake placeholder lines.
  const { doc, numPages } = usePdfDocument(pdfFile);

  // Download the original (unsigned) PDF the sender just picked. Surfaced
  // in the hamburger drawer when a file is loaded — gives the sender a
  // copy for their records before sending. Drives off the local `File`
  // (no network round-trip; the bytes are already in memory). The hook
  // sanitises the filename and appends `.pdf` if missing.
  const { download: downloadPdfFile, busy: downloadPdfBusy } = useDownloadPdf({
    getBlob: () => {
      if (!pdfFile) throw new Error('No file picked');
      return pdfFile;
    },
    filename: pdfFile?.name ?? 'document.pdf',
  });
  const handleDownloadOriginalPdf = useCallback((): void => {
    if (!pdfFile) return;
    downloadPdfFile().catch(() => {
      /* hook tracks its own error; click boundary swallows so React's
         onClick doesn't see an unhandled rejection (rule 4.4). */
    });
  }, [downloadPdfFile, pdfFile]);

  // ---- Google Drive integration (Phase 5, mobile-only) ----
  // The picker is fully gated behind `feature.gdriveIntegration` AND a
  // connected account; the dark build never mounts it. The OAuth flow
  // is full-page redirect (Q2 in clarifications-mobile.md): iOS Safari
  // silently blocks popup-based auth, and the redirect target carries a
  // `return=/m/send/drive` so we can re-open the picker on come-back.
  const gdriveOn = isFeatureEnabled('gdriveIntegration');
  const accountsQuery = useGDriveAccounts();
  const driveAccounts = gdriveOn ? (accountsQuery.data ?? []) : [];
  const driveAccountId = driveAccounts[0]?.id ?? null;
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);

  const beginDriveOAuth = useCallback((): void => {
    if (!GDRIVE_API_BASE) return;
    const ret = encodeURIComponent('/m/send/drive');
    window.location.href = `${GDRIVE_API_BASE}/integrations/gdrive/oauth/start?return=${ret}`;
  }, []);

  const handlePickFromDrive = useCallback((): void => {
    if (driveAccountId) {
      setDrivePickerOpen(true);
      return;
    }
    beginDriveOAuth();
  }, [driveAccountId, beginDriveOAuth]);

  const reauthorizeDrive = useCallback((): void => {
    if (!GDRIVE_API_BASE) return;
    const ret = encodeURIComponent('/m/send/drive');
    window.location.href = `${GDRIVE_API_BASE}/integrations/gdrive/oauth/start?return=${ret}&prompt=consent`;
  }, []);

  // Auto-open the picker when the OAuth callback returned us to
  // /m/send?gdrive_connected=1. Strip the param after consuming so a
  // back-then-forward doesn't re-open the sheet uninvited (rule 4.4 —
  // one effect, one responsibility).
  useEffect(() => {
    if (!gdriveOn) return;
    if (searchParams.get('gdrive_connected') !== '1') return;
    if (!driveAccountId) return;
    setDrivePickerOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('gdrive_connected');
    setSearchParams(next, { replace: true });
  }, [gdriveOn, searchParams, driveAccountId, setSearchParams]);

  const [signers, setSigners] = useState<ReadonlyArray<MobileSigner>>([]);
  const [meIncluded, setMeIncluded] = useState(false);

  // Place-step state
  const [page, setPage] = useState(1);
  const [armedTool, setArmedTool] = useState<MobileFieldType | null>(null);
  const [fields, setFields] = useState<ReadonlyArray<MobilePlacedField>>([]);
  const [selectedIds, setSelectedIds] = useState<ReadonlyArray<string>>([]);
  const [canvasBounds, setCanvasBounds] = useState<CanvasBounds>({
    width: 320,
    height: 340,
  });

  // Sheet routing
  const [sheet, setSheet] = useState<'apply' | 'assign' | 'addSigner' | null>(null);
  const [assignSeedAll, setAssignSeedAll] = useState(false);

  // Review-step content
  const [title, setTitle] = useState<string>('');
  // QA-2026-05-02 (Bug 6): the prior `message` state was wired through to
  // MWReview but `useSendEnvelope` never forwarded it to the API, so
  // anything the sender typed was silently dropped on send. Removed
  // entirely until the wire DTO grows a `message` field — surfacing a
  // dead input in the meantime is worse UX than not showing it at all.

  // Sent-step results
  const [sentEnvelopeId, setSentEnvelopeId] = useState<string | null>(null);
  const [sentShortCode, setSentShortCode] = useState<string | null>(null);

  // ---- Title default once a file lands ----
  useEffect(() => {
    if (!pdfFile) return;
    setTitle((prev) => prev || pdfFile.name.replace(/\.pdf$/i, ''));
  }, [pdfFile]);

  // ---- "Add me as signer" toggle ----
  // QA-2026-05-02 (Bug 2): keyed off `session.user`, not `useAuth().user`.
  // `useAuth().user` returns null for anonymous Supabase sessions (the
  // NavBar / AppState gate on named-account on purpose), but a guest is
  // still authenticated and should be able to toggle "Add me as signer".
  // We fall back to the named-account display info when present and to
  // `session.user.email` (may be empty for anon) otherwise.
  useEffect(() => {
    const sessionUser = session?.user;
    if (!sessionUser) return;
    setSigners((prev) => {
      const meId = `me:${sessionUser.id}`;
      const has = prev.some((s) => s.id === meId);
      if (meIncluded && !has) {
        const fallbackName = user?.name || sessionUser.email || 'Me';
        const fallbackEmail = user?.email || sessionUser.email || '';
        const colorIdx = prev.length % SIGNER_COLOR_PALETTE.length;
        return [
          {
            id: meId,
            name: fallbackName,
            email: fallbackEmail,
            color: SIGNER_COLOR_PALETTE[colorIdx] ?? '#818CF8',
            initials: initialsFromName(fallbackName),
          },
          ...prev,
        ];
      }
      if (!meIncluded && has) return prev.filter((s) => s.id !== meId);
      return prev;
    });
  }, [meIncluded, session, user]);

  const totalPages = Math.max(1, numPages || 1);

  // Reset the editor's selection when paging away from a selection's source.
  // Selection itself stays valid but the field-action toolbar follows the
  // page (only renders for the visible field).
  useEffect(() => {
    if (!armedTool) return;
    // Re-arm cancellation when the page changes mid-arm — feels less surprising.
    // (no-op: armedTool is preserved; comment kept for intent-clarity)
  }, [armedTool, page]);

  // ---- step navigation ----
  const goNext = useCallback((): void => {
    setStep((s) => {
      const i = MOBILE_STEP_ORDER.indexOf(s);
      return MOBILE_STEP_ORDER[Math.min(i + 1, MOBILE_STEP_ORDER.length - 1)] ?? s;
    });
  }, []);

  const goBack = useCallback((): void => {
    setStep((s) => {
      const i = MOBILE_STEP_ORDER.indexOf(s);
      return MOBILE_STEP_ORDER[Math.max(0, i - 1)] ?? s;
    });
  }, []);

  // ---- file pick ----
  // Reject empty files at the boundary — pdf.js parses a zero-byte buffer
  // as a 1-page doc with no canvas content, which silently advances the
  // user to the place step with nothing to drop fields on.
  // 2026-05-04: the "Take photo" tile uses `accept="image/*"` +
  // `capture="environment"`. We now convert the JPEG/PNG into a single-
  // page A4 PDF in the browser via `imageFileToPdf` and continue the
  // existing pipeline unchanged — no server changes needed. HEIC and
  // other unknown formats fall into the catch and surface a friendly
  // alert. QA-2026-05-02 (Bug 11): cap upload size at 25 MB — mobile
  // devices OOM their pdf.js worker on much larger files.
  const [isConverting, setIsConverting] = useState(false);
  const handlePickFile = useCallback(async (file: File): Promise<void> => {
    if (file.size === 0) {
      setFileError(`"${file.name}" is empty (0 bytes). Pick a different file.`);
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setFileError(`"${file.name}" is ${mb} MB — please choose a file under 25 MB.`);
      return;
    }
    // `file.type` is sometimes empty (drag-drop on certain browsers); fall
    // back to the extension.
    const looksLikePdf =
      file.type === 'application/pdf' || (file.type === '' && /\.pdf$/i.test(file.name));
    const looksLikeImage =
      file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);

    let resolved: File;
    if (looksLikePdf) {
      resolved = file;
    } else if (looksLikeImage) {
      setFileError(null);
      setIsConverting(true);
      try {
        resolved = await imageFileToPdf(file);
      } catch {
        setFileError(
          `We couldn't convert "${file.name}" to a PDF. Try a JPEG or PNG, or upload a PDF instead.`,
        );
        return;
      } finally {
        setIsConverting(false);
      }
    } else {
      setFileError(`"${file.name}" isn't a PDF or supported image. Pick a PDF, JPEG, or PNG.`);
      return;
    }
    setFileError(null);
    setPdfFile(resolved);
    setFields([]);
    setSelectedIds([]);
    setStep('file');
  }, []);

  // ---- signers ----
  // QA-2026-05-02 (Bug 5): the previous implementation silently dropped
  // duplicate-email submissions (returned `prev` unchanged) but still
  // closed the sheet, leaving the user with no signal that nothing
  // happened. Now we hand the duplicate check to the sheet via an
  // `existingEmails` prop so the form blocks Add and shows an inline
  // hint, and on success we close. The parent stays the source of truth
  // for the signers list; the sheet only validates against it.
  const addSignerLocal = useCallback((input: SignerInput): void => {
    setSigners((prev) => {
      const colorIdx = prev.length % SIGNER_COLOR_PALETTE.length;
      return [
        ...prev,
        {
          id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          name: input.name,
          email: input.email,
          color: SIGNER_COLOR_PALETTE[colorIdx] ?? '#818CF8',
          initials: initialsFromName(input.name),
        },
      ];
    });
    setSheet(null);
  }, []);

  // QA-2026-05-02 (Bug 9): when the removed signer was the only owner of
  // a placed field, the previous implementation silently filtered the
  // field out — so the user lost placement work with no warning. We now
  // reassign orphaned fields to the first remaining signer (using the
  // value of `signers` *after* the removal). Only when no signers remain
  // do we drop the now-unassignable fields; in that case the place-step
  // CTA is already disabled, so there's no surprise.
  const removeSigner = useCallback((id: string): void => {
    setSigners((prev) => {
      const next = prev.filter((s) => s.id !== id);
      const fallbackId = next[0]?.id ?? null;
      setFields((fs) =>
        fs
          .map((f) => {
            if (!f.signerIds.includes(id)) return f;
            const remaining = f.signerIds.filter((sid) => sid !== id);
            if (remaining.length > 0) return { ...f, signerIds: remaining };
            if (fallbackId !== null) return { ...f, signerIds: [fallbackId] };
            return { ...f, signerIds: [] };
          })
          .filter((f) => f.signerIds.length > 0),
      );
      return next;
    });
  }, []);

  const existingSignerEmails = useMemo<ReadonlyArray<string>>(
    () => signers.map((s) => s.email.toLowerCase()),
    [signers],
  );

  // Pull saved contacts into the local signer list as a one-shot seed when
  // the user taps "Add signer" — but only the first time. They can be
  // removed afterwards. This bridges the mobile flow with the address
  // book without an extra picker UI.
  useEffect(() => {
    if (signers.length > 0) return;
    if (contacts.length === 0) return;
    // Don't auto-add — leave the picker explicit. Comment reserved.
  }, [signers.length, contacts.length]);

  // ---- placement ----
  const handleCanvasTap = useCallback(
    (pos: { x: number; y: number }): void => {
      if (!armedTool) return;
      const f = buildDroppedField({
        type: armedTool,
        page,
        position: pos,
        firstSignerId: signers[0]?.id,
      });
      setFields((fs) => [...fs, f]);
      setArmedTool(null);
      setSelectedIds([f.id]);
      if (signers.length > 1) {
        setAssignSeedAll(true);
        setSheet('assign');
      }
    },
    [armedTool, page, signers],
  );

  const handleTapField = useCallback((id: string, replace: boolean): void => {
    setSelectedIds((prev) => toggleSelection(prev, id, replace));
  }, []);

  const handleClearSelection = useCallback((): void => {
    setSelectedIds([]);
  }, []);

  const handleCommitDrag = useCallback(
    (ids: ReadonlyArray<string>, dx: number, dy: number): void => {
      setFields((fs) => commitDrag({ fields: fs, ids, dx, dy, bounds: canvasBounds }));
    },
    [canvasBounds],
  );

  const handleApplyPages = useCallback(
    (mode: MobileApplyMode, pages: ReadonlyArray<number>): void => {
      setFields((fs) =>
        applyPagesToSelection({
          fields: fs,
          selectedIds,
          mode,
          currentPage: page,
          totalPages,
          customPages: pages,
        }),
      );
      setSheet(null);
    },
    [selectedIds, page, totalPages],
  );

  const handleAssignSigners = useCallback(
    (signerIds: ReadonlyArray<string>): void => {
      setFields((fs) => {
        const result = assignSignersToSelection({
          fields: fs,
          selectedIds,
          signerIds,
          bounds: canvasBounds,
        });
        setSelectedIds(result.nextSelection);
        return result.fields;
      });
      setSheet(null);
    },
    [selectedIds, canvasBounds],
  );

  const handleDeleteSelected = useCallback((): void => {
    setFields((fs) => deleteFields(fs, selectedIds));
    setSelectedIds([]);
  }, [selectedIds]);

  // Representative field for the current sheets (first selected on this page).
  const representative: MobilePlacedField | null = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const candidate = fields.find((f) => selectedIds.includes(f.id));
    return candidate ?? null;
  }, [fields, selectedIds]);

  const currentMode: MobileApplyMode = useMemo(() => {
    if (!representative) return 'this';
    const linked = representative.linkedPages;
    if (linked.length === totalPages) return 'all';
    if (linked.length === Math.max(1, totalPages - 1)) return 'allButLast';
    if (linked.length === 1 && linked[0] === totalPages) return 'last';
    return 'this';
  }, [representative, totalPages]);

  // ---- send ----
  const sendingRef = useRef(false);
  const handleSend = useCallback(async (): Promise<void> => {
    if (sendingRef.current) return;
    if (!pdfFile) return;
    if (signers.length === 0) return;
    sendingRef.current = true;
    try {
      // Build contact-id'd inputs when we recognize the local signer as a
      // saved contact (id matches), else send name+email so the API mints
      // an ad-hoc signer. `me:<uid>` always falls into the ad-hoc path.
      const sendSigners: ReadonlyArray<SendEnvelopeSignerInput> = signers.map((s) => {
        const c = contacts.find((c2) => c2.id === s.id);
        if (c) {
          return { localId: s.id, contactId: c.id };
        }
        return { localId: s.id, name: s.name, email: s.email, color: s.color };
      });

      const out = await runSend({
        title: title || pdfFile.name.replace(/\.pdf$/i, '') || 'Untitled',
        file: pdfFile,
        signers: sendSigners,
        // exactOptionalPropertyTypes — only set sender* keys when present.
        ...(user?.email ? { senderEmail: user.email } : {}),
        ...(user?.name ? { senderName: user.name } : {}),
        buildFields: (localToServer) =>
          fields.flatMap<FieldPlacement>((f) => {
            const linked = f.linkedPages.length > 0 ? f.linkedPages : [f.page];
            const xPct = canvasBounds.width > 0 ? f.x / canvasBounds.width : 0;
            const yPct = canvasBounds.height > 0 ? f.y / canvasBounds.height : 0;
            // Approximate normalized field size — the API expects 0–1 box
            // coords. Mobile's fixed pixel widths scale uniformly.
            // The DTO requires `width`/`height` keys; emitting `w`/`h`
            // here caused every mobile send to 400 because Nest's
            // ValidationPipe runs with `forbidNonWhitelisted: true`.
            const widthPct = canvasBounds.width > 0 ? 80 / canvasBounds.width : 0.25;
            const heightPct = canvasBounds.height > 0 ? 28 / canvasBounds.height : 0.08;
            return f.signerIds.flatMap((sid) => {
              const serverId = localToServer.get(sid);
              if (!serverId) return [];
              return linked.map<FieldPlacement>((p) => ({
                signer_id: serverId,
                page: p,
                x: xPct,
                y: yPct,
                width: widthPct,
                height: heightPct,
                kind: FIELD_TYPE_TO_API[f.type],
                ...(f.type === 'txt' || f.type === 'chk' ? { required: true } : {}),
              }));
            });
          }),
      });
      setSentEnvelopeId(out.envelope_id);
      setSentShortCode(out.short_code);
      setStep('sent');
    } catch {
      // sendError is surfaced from the hook for UI display below.
    } finally {
      sendingRef.current = false;
    }
  }, [pdfFile, signers, contacts, runSend, title, user, fields, canvasBounds]);

  // ---- per-step CTA ----
  const stepNum = MOBILE_STEP_ORDER.indexOf(step) + 1;
  const showStepper = step !== 'start' && step !== 'sent';
  const sticky = (() => {
    if (step === 'file') {
      return (
        <StickyBar>
          <SecondaryBtn type="button" onClick={() => setStep('start')}>
            Cancel
          </SecondaryBtn>
          <PrimaryBtn type="button" onClick={goNext} disabled={!pdfFile}>
            Continue <ArrowRight size={16} aria-hidden />
          </PrimaryBtn>
        </StickyBar>
      );
    }
    if (step === 'signers') {
      return (
        <StickyBar>
          <PrimaryBtn type="button" onClick={goNext} disabled={signers.length === 0}>
            Next: place fields <ArrowRight size={16} aria-hidden />
          </PrimaryBtn>
        </StickyBar>
      );
    }
    if (step === 'place') {
      return (
        <StickyBar>
          <PrimaryBtn type="button" onClick={goNext} disabled={fields.length === 0}>
            Review · {fields.length} field{fields.length === 1 ? '' : 's'}{' '}
            <ArrowRight size={16} aria-hidden />
          </PrimaryBtn>
        </StickyBar>
      );
    }
    if (step === 'review') {
      const sending =
        sendPhase === 'creating' ||
        sendPhase === 'uploading' ||
        sendPhase === 'adding-signers' ||
        sendPhase === 'placing-fields' ||
        sendPhase === 'sending';
      return (
        <StickyBar>
          <PrimaryBtn
            type="button"
            onClick={() => {
              void handleSend();
            }}
            disabled={sending || signers.length === 0}
          >
            <Send size={16} aria-hidden /> {sending ? 'Sending…' : 'Send for signature'}
          </PrimaryBtn>
        </StickyBar>
      );
    }
    return null;
  })();

  return (
    <Shell>
      {/* Slim top nav. Always visible (including the Sent step) so the
          authed user can always reach Documents / Templates / Signers and
          their account actions — fixing the original gap where /m/send
          had no nav chrome at all. */}
      <MWMobileNav
        onSignOut={handleNavSignOut}
        downloadOriginalPdfBusy={downloadPdfBusy}
        {...(pdfFile ? { onDownloadOriginalPdf: handleDownloadOriginalPdf } : {})}
      />
      <Scroller $padBottom={sticky ? 96 : 24}>
        {showStepper && (
          <MWStep step={stepNum} total={6} label={STEP_LABELS[step]} onBack={goBack} />
        )}
        {step === 'start' && (
          <>
            {fileError && <ErrorBanner role="alert">{fileError}</ErrorBanner>}
            {isConverting && (
              <ErrorBanner role="status" aria-live="polite">
                Converting photo to PDF…
              </ErrorBanner>
            )}
            <MWStart
              onPickFile={handlePickFile}
              {...(gdriveOn ? { onPickFromDrive: handlePickFromDrive } : {})}
            />
          </>
        )}
        {step === 'file' && pdfFile && (
          <MWFile
            fileName={pdfFile.name}
            totalPages={totalPages}
            fileSizeBytes={pdfFile.size}
            doc={doc}
            onReplace={() => {
              setPdfFile(null);
              setStep('start');
            }}
          />
        )}
        {step === 'signers' && (
          <MWSigners
            signers={signers}
            meIncluded={meIncluded}
            onMeToggle={() => setMeIncluded((v) => !v)}
            onAdd={() => setSheet('addSigner')}
            onRemove={removeSigner}
          />
        )}
        {step === 'place' && (
          <MWPlace
            page={page}
            totalPages={totalPages}
            onPage={setPage}
            doc={doc}
            fields={fields}
            signers={signers}
            selectedIds={selectedIds}
            armedTool={armedTool}
            onArmTool={setArmedTool}
            onCanvasTap={handleCanvasTap}
            onTapField={handleTapField}
            onClearSelection={handleClearSelection}
            onOpenApply={() => setSheet('apply')}
            onOpenAssign={() => {
              setAssignSeedAll(false);
              setSheet('assign');
            }}
            onDeleteSelected={handleDeleteSelected}
            onCommitDrag={handleCommitDrag}
            onCanvasMeasured={setCanvasBounds}
          />
        )}
        {step === 'review' && pdfFile && (
          <>
            <MWReview
              title={title}
              onTitle={setTitle}
              signers={signers}
              fields={fields}
              fileName={pdfFile.name}
              totalPages={totalPages}
            />
            {sendPhase === 'error' && sendError && (
              <div
                role="alert"
                style={{
                  padding: '0 16px 12px',
                  color: 'var(--danger-700)',
                  fontSize: 13,
                }}
              >
                Couldn&apos;t send: {sendError.message}
              </div>
            )}
          </>
        )}
        {step === 'sent' && (
          <MWSent
            title={title}
            {...(sentShortCode ? { code: sentShortCode } : {})}
            signers={signers}
            onView={() => {
              if (sentEnvelopeId) navigate(`/document/${sentEnvelopeId}`);
              else navigate('/documents');
            }}
            onAnother={() => {
              setPdfFile(null);
              setSigners([]);
              setMeIncluded(false);
              setFields([]);
              setSelectedIds([]);
              setTitle('');
              setSentEnvelopeId(null);
              setSentShortCode(null);
              setStep('start');
            }}
          />
        )}
      </Scroller>
      {sticky}

      {/* Bottom sheets */}
      <MWApplyPagesSheet
        open={sheet === 'apply'}
        onClose={() => setSheet(null)}
        totalPages={totalPages}
        currentPage={page}
        currentMode={currentMode}
        onApply={handleApplyPages}
      />
      <MWAssignSignersSheet
        open={sheet === 'assign'}
        onClose={() => setSheet(null)}
        signers={signers}
        initialSelectedIds={
          assignSeedAll ? signers.map((s) => s.id) : (representative?.signerIds ?? [])
        }
        onApply={handleAssignSigners}
      />
      <MWAddSignerSheet
        open={sheet === 'addSigner'}
        onClose={() => setSheet(null)}
        onAdd={addSignerLocal}
        existingEmails={existingSignerEmails}
      />

      {/* Mobile Drive picker (Phase 5). Fully gated by the feature
          flag + a connected account — the dark build never mounts it.
          On pick, the imported PDF goes through the same handlePickFile
          boundary as the upload and camera tiles so file-type / size
          rejection stays consistent. */}
      {gdriveOn && driveAccountId && (
        <MobileDrivePicker
          open={drivePickerOpen}
          accountId={driveAccountId}
          onClose={() => setDrivePickerOpen(false)}
          onReconnect={reauthorizeDrive}
          onPick={(file) => {
            setDrivePickerOpen(false);
            handlePickFile(file);
          }}
        />
      )}
    </Shell>
  );
}
