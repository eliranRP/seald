import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Send } from 'lucide-react';
import { Shell, Scroller, StickyBar, PrimaryBtn, SecondaryBtn } from './MobileSendPage.styles';
import { MWStep } from './components/MWStep';
import { MWAddSignerSheet } from './components/MWAddSignerSheet';
import { MWApplyPagesSheet } from './components/MWApplyPagesSheet';
import { MWAssignSignersSheet } from './components/MWAssignSignersSheet';
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
import { usePdfDocument } from '@/lib/pdf';
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
export function MobileSendPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { contacts } = useAppState();
  const { run: runSend, phase: sendPhase, error: sendError } = useSendEnvelope();

  const [step, setStep] = useState<MobileStep>('start');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const { numPages } = usePdfDocument(pdfFile);

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
  const [message, setMessage] = useState<string>('');

  // Sent-step results
  const [sentEnvelopeId, setSentEnvelopeId] = useState<string | null>(null);
  const [sentShortCode, setSentShortCode] = useState<string | null>(null);

  // ---- Title default once a file lands ----
  useEffect(() => {
    if (!pdfFile) return;
    setTitle((prev) => prev || pdfFile.name.replace(/\.pdf$/i, ''));
  }, [pdfFile]);

  // ---- "Add me as signer" toggle ----
  useEffect(() => {
    if (!user) return;
    setSigners((prev) => {
      const meId = `me:${user.id}`;
      const has = prev.some((s) => s.id === meId);
      if (meIncluded && !has) {
        const colorIdx = prev.length % SIGNER_COLOR_PALETTE.length;
        return [
          {
            id: meId,
            name: user.name || user.email || 'Me',
            email: user.email,
            color: SIGNER_COLOR_PALETTE[colorIdx] ?? '#818CF8',
            initials: initialsFromName(user.name || user.email || 'Me'),
          },
          ...prev,
        ];
      }
      if (!meIncluded && has) return prev.filter((s) => s.id !== meId);
      return prev;
    });
  }, [meIncluded, user]);

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
  const handlePickFile = useCallback((file: File): void => {
    setPdfFile(file);
    setFields([]);
    setSelectedIds([]);
    setStep('file');
  }, []);

  // ---- signers ----
  const addSignerLocal = useCallback((input: SignerInput): void => {
    setSigners((prev) => {
      if (prev.some((s) => s.email.toLowerCase() === input.email.toLowerCase())) {
        return prev;
      }
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

  const removeSigner = useCallback((id: string): void => {
    setSigners((prev) => prev.filter((s) => s.id !== id));
    setFields((fs) =>
      fs
        .map((f) => ({ ...f, signerIds: f.signerIds.filter((sid) => sid !== id) }))
        .filter((f) => f.signerIds.length > 0),
    );
  }, []);

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
            const wPct = canvasBounds.width > 0 ? 80 / canvasBounds.width : 0.25;
            const hPct = canvasBounds.height > 0 ? 28 / canvasBounds.height : 0.08;
            return f.signerIds.flatMap((sid) => {
              const serverId = localToServer.get(sid);
              if (!serverId) return [];
              return linked.map<FieldPlacement>((p) => ({
                signer_id: serverId,
                page: p,
                x: xPct,
                y: yPct,
                w: wPct,
                h: hPct,
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
      <Scroller $padBottom={sticky ? 96 : 24}>
        {showStepper && (
          <MWStep step={stepNum} total={6} label={STEP_LABELS[step]} onBack={goBack} />
        )}
        {step === 'start' && <MWStart onPickFile={handlePickFile} />}
        {step === 'file' && pdfFile && (
          <MWFile
            fileName={pdfFile.name}
            totalPages={totalPages}
            fileSizeBytes={pdfFile.size}
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
              message={message}
              onMessage={setMessage}
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
              setMessage('');
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
      />
    </Shell>
  );
}
