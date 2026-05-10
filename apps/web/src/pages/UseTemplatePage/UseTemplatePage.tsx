import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Bookmark, Info, UploadCloud } from 'lucide-react';
import { isFeatureEnabled } from 'shared';
import type { AddSignerContact } from '@/components/AddSignerDropdown/AddSignerDropdown.types';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { SignersStepCard } from '@/components/SignersStepCard';
import type { SignersStepSigner } from '@/components/SignersStepCard';
import { TemplateFlowHeader } from '@/components/TemplateFlowHeader';
import type { TemplateFlowMode } from '@/components/TemplateFlowHeader';
import { DrivePicker } from '@/components/drive-picker';
import {
  ConversionFailedDialog,
  ConversionProgressDialog,
  useDriveImport,
} from '@/features/gdriveImport';
import { UploadPage } from '@/pages/UploadPage';
import {
  useConnectGDrive,
  useGDriveAccounts,
} from '@/routes/settings/integrations/useGDriveAccounts';
import {
  findTemplateById,
  getTemplates,
  subscribeToTemplates,
  type TemplateSummary,
} from '@/features/templates';
import { pickAvailableColor } from '@/features/signers/pickAvailableColor';
import { useAppState } from '@/providers/AppStateProvider';
import {
  DocumentTitle,
  DocumentTitleRow,
  FooterHint,
  InfoIconButton,
  NotFoundCard,
  NotFoundLede,
  NotFoundTitle,
  Page,
  SavedDocBody,
  SavedDocCard,
  SavedDocCover,
  SavedDocLine,
  SavedDocMeta,
  SavedDocName,
  SavedDocPaper,
  SavedDocStack,
  SavedDocStripe,
  Segmented,
  SegmentedButton,
  StepBody,
  StepInner,
  TooltipBubble,
  TooltipWrap,
} from './UseTemplatePage.styles';

/**
 * Stable color palette for guest signers (typed-in emails). Cycles
 * after 6 — matches the Design-Guide's SignersDropdown palette so the
 * step 1 chip and the editor's PlacedField swatch agree on color
 * assignment for the same signer.
 */
const SIGNER_COLORS = ['#F472B6', '#7DD3FC', '#FBBF24', '#A78BFA', '#34D399', '#FB7185'] as const;

/**
 * Project the API's `last_signers` (camelCased to `lastSigners` on
 * `TemplateSummary`) onto the wizard's `SignersStepSigner` shape.
 * `contactId` is null for guest signers (id prefixed `s-`); known
 * contacts surface their canonical id so the editor + downstream
 * matchers can look them up.
 */
function mapLastSignersToStep(
  saved:
    | ReadonlyArray<{
        readonly id: string;
        readonly name: string;
        readonly email: string;
        readonly color: string;
      }>
    | undefined,
): ReadonlyArray<SignersStepSigner> {
  if (!saved || saved.length === 0) return [];
  return saved.map((s) => ({
    id: s.id,
    contactId: s.id.startsWith('s-') ? null : s.id,
    name: s.name,
    email: s.email,
    color: s.color,
  }));
}

/**
 * L4 page — `/templates/:id/use` (and `/templates/new` via aliasing).
 * Implements the 3-step Use-template flow per the latest design guide
 * (`Design-Guide/project/templates-flow/UseTemplate.jsx`).
 *
 *   Step 1 — Signers   : Centered card with empty pill, ordinal
 *                        signer list, inline picker. Uses SignersStepCard.
 *   Step 2 — Document  : For 'use' mode, segmented "Use saved /
 *                        Upload new"; for 'new' mode, a single drop-zone.
 *   Step 3 — Fields    : Existing place-fields editor at
 *                        `/document/new?template=<id>`. The wizard
 *                        navigates away here; the editor surfaces a
 *                        TemplateModeBanner in its place.
 *
 * Step order (Signers → Document → Fields) was settled per the
 * latest design guide. Picking signers first means the user commits
 * to recipients before they touch the document choice — and that
 * decision often determines whether the saved layout still applies.
 */
export function UseTemplatePage() {
  const { id = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { contacts } = useAppState();

  const decodedId = decodeURIComponent(id);
  const isNewTemplate = decodedId === 'new';

  /**
   * Reactive read of the templates module store. Plain `findTemplateById`
   * + `useMemo` only ran once on mount, so when the user deep-linked to
   * `/templates/:id/use` BEFORE the module store had hydrated from the
   * API, `template` would resolve to `undefined` and stay that way —
   * which meant the lazy-init `signers` state never picked up
   * `lastSigners`. `useSyncExternalStore` re-renders on every store
   * mutation so the page reflects the canonical record once it loads.
   */
  const templates = useSyncExternalStore<ReadonlyArray<TemplateSummary>>(
    subscribeToTemplates,
    getTemplates,
    getTemplates,
  );
  const template = useMemo<TemplateSummary | undefined>(
    () =>
      isNewTemplate
        ? undefined
        : (templates.find((t) => t.id === decodedId) ?? findTemplateById(decodedId)),
    [decodedId, isNewTemplate, templates],
  );

  const mode: TemplateFlowMode = useMemo(() => {
    if (isNewTemplate) return 'new';
    if (searchParams.get('mode') === 'edit') return 'editing';
    return 'using';
  }, [isNewTemplate, searchParams]);

  // Wizard state ---------------------------------------------------------
  // Step 1: signers; Step 2: document. Step 3 is the editor (different route).
  const [step, setStep] = useState<1 | 2>(1);
  /**
   * For 'using' / 'editing' mode we pre-fill the signer roster with
   * the template's `lastSigners` (captured on the previous "Send and
   * update template"). Brand-new templates start empty. This matches
   * the design guide's "Pre-filled from last time" subtitle.
   *
   * The lazy init handles the case where the template is already in
   * the module store at mount time. The effect below covers the
   * deep-link case where the API hydration finishes after mount.
   */
  const [signers, setSigners] = useState<ReadonlyArray<SignersStepSigner>>(() =>
    mapLastSignersToStep(template?.lastSigners),
  );
  /**
   * Tracks whether the user has touched the signer roster. Once they
   * have, we stop auto-seeding from `lastSigners` so a late-arriving
   * store update can't overwrite the user's edits.
   */
  const userTouchedSignersRef = useRef(false);
  useEffect(() => {
    if (userTouchedSignersRef.current) return;
    if (signers.length > 0) return;
    const saved = template?.lastSigners ?? [];
    if (saved.length === 0) return;
    setSigners(mapLastSignersToStep(saved));
  }, [template, signers.length]);
  const [docChoice, setDocChoice] = useState<'saved' | 'upload'>(() =>
    isNewTemplate ? 'upload' : 'saved',
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);

  // Google Drive integration (WT-E). The replace-with row in step 1
  // exposes a "Pick from Google Drive" peer to "Upload a PDF" when the
  // feature flag is on. The same picker + conversion + dialogs as the
  // New Document surface — we reuse the orchestrator hook so doc-byte
  // handling stays identical across both flows (watchpoint #6).
  const gdriveOn = isFeatureEnabled('gdriveIntegration');
  const accountsQuery = useGDriveAccounts();
  const accounts = gdriveOn ? (accountsQuery.data ?? []) : [];
  const driveAccountId = accounts[0]?.id ?? null;
  const connectDrive = useConnectGDrive();
  const handleConnectDrive = useCallback((): void => {
    connectDrive.mutate();
  }, [connectDrive]);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const driveImport = useDriveImport({
    accountId: driveAccountId ?? '',
    onReady: (file) => {
      // Drop the converted PDF into the wizard's pendingFile slot —
      // every downstream branch (continueToSigners, continueToEditor)
      // already handles a `pendingFile` from upload, so the Drive path
      // converges with the existing flow without a new code path.
      setUploadError(null);
      setPendingFile(file);
      setDocChoice('upload');
    },
  });
  const [renamedTitle, setRenamedTitle] = useState<string | null>(() =>
    isNewTemplate ? 'Untitled template' : null,
  );

  // Step navigation ------------------------------------------------------

  const goBackToList = useCallback(() => {
    navigate('/templates');
  }, [navigate]);

  const goBackOneStep = useCallback(() => {
    if (step === 2) setStep(1);
    else goBackToList();
  }, [step, goBackToList]);

  // Step 1 (Document) → Step 2 (Signers). Gated on having a valid
  // document source — saved-doc requires the template, upload
  // requires a pendingFile.
  const continueToSigners = useCallback(() => {
    if (docChoice === 'saved' && !template) return;
    if (docChoice === 'upload' && !pendingFile) return;
    setStep(2);
  }, [docChoice, template, pendingFile]);

  /**
   * Step 2 (Signers) → Step 3 (template editor). Routes to the
   * dedicated `/templates/:id/edit` surface, which renders the
   * TemplateFlowHeader chrome instead of the global app NavBar so
   * the entire wizard reads as a single connected flow.
   */
  const continueToEditor = useCallback(() => {
    if (signers.length === 0) return;
    if (docChoice === 'saved' && !template) return;
    if (docChoice === 'upload' && !pendingFile) return;

    const handoffSigners: ReadonlyArray<AddSignerContact> = signers.map((s) => ({
      id: s.contactId ?? s.id,
      name: s.name,
      email: s.email,
      color: s.color,
    }));

    // Saved-doc branch: reuse the saved example. We don't carry a
    // File object — the route falls back to a synthesized placeholder
    // (the actual signed envelope's example PDF lives server-side
    // once /templates/:id/example lands).
    if (docChoice === 'saved' && template) {
      navigate(`/templates/${encodeURIComponent(template.id)}/edit`, {
        state: { templateSigners: handoffSigners },
      });
      return;
    }

    if (template) {
      navigate(`/templates/${encodeURIComponent(template.id)}/edit`, {
        state: { templateSigners: handoffSigners, pendingFile },
      });
      return;
    }

    // 'new' mode — sender is authoring a brand-new template.
    navigate('/templates/new/edit', {
      state: {
        templateSigners: handoffSigners,
        pendingFile,
        ...(renamedTitle ? { templateRename: renamedTitle } : {}),
      },
    });
  }, [docChoice, navigate, pendingFile, renamedTitle, signers, template]);

  // Picker handlers ------------------------------------------------------

  const togglePickContact = useCallback((contact: AddSignerContact) => {
    userTouchedSignersRef.current = true;
    setSigners((prev) => {
      const exists = prev.find((s) => s.email.toLowerCase() === contact.email.toLowerCase());
      if (exists) {
        return prev.filter((s) => s.email.toLowerCase() !== contact.email.toLowerCase());
      }
      // Override the contact's stored color when it would collide with a
      // signer already in the roster. Two contacts can carry the same
      // palette entry in the contact-store; we still want each signer in
      // a single envelope to render in a unique color.
      const used = prev.map((s) => s.color);
      const color = used.includes(contact.color)
        ? pickAvailableColor(SIGNER_COLORS, used)
        : contact.color;
      return [
        ...prev,
        {
          id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          contactId: contact.id,
          name: contact.name,
          email: contact.email,
          color,
        },
      ];
    });
  }, []);

  const createGuestSigner = useCallback((name: string, email: string) => {
    userTouchedSignersRef.current = true;
    setSigners((prev) => {
      if (prev.some((s) => s.email.toLowerCase() === email.toLowerCase())) {
        return prev;
      }
      const color = pickAvailableColor(
        SIGNER_COLORS,
        prev.map((s) => s.color),
      );
      return [
        ...prev,
        {
          id: `s-${Date.now()}`,
          contactId: null,
          name: name || email.split('@')[0] || email,
          email,
          color,
        },
      ];
    });
  }, []);

  const removeSigner = useCallback((rowId: string) => {
    userTouchedSignersRef.current = true;
    setSigners((prev) => prev.filter((s) => s.id !== rowId));
  }, []);

  const renameTemplate = useCallback((next: string) => {
    setRenamedTitle(next);
  }, []);

  // Not-found surface ----------------------------------------------------

  if (!template && !isNewTemplate) {
    return (
      <Page>
        <TemplateFlowHeader
          step={1}
          mode="using"
          templateName="Template"
          onBack={goBackToList}
          onCancel={goBackToList}
        />
        <StepBody>
          <NotFoundCard role="alert">
            <NotFoundTitle>Template not found</NotFoundTitle>
            <NotFoundLede>
              The template you opened may have been removed. Pick another from the list.
            </NotFoundLede>
            <Button variant="primary" onClick={goBackToList}>
              Back to templates
            </Button>
          </NotFoundCard>
        </StepBody>
      </Page>
    );
  }

  const headerTitle = renamedTitle ?? template?.name ?? 'New template';

  return (
    <Page>
      <TemplateFlowHeader
        step={step}
        mode={mode}
        templateName={headerTitle}
        onRenameTemplate={renameTemplate}
        onBack={goBackOneStep}
        onCancel={goBackToList}
      />

      {/*
        STEP 1 — Document. For 'using' mode the user picks between
        the saved example doc and a fresh upload (segmented choice
        at the top). For 'new' mode there's no saved example to
        choose from — only the dropzone. Continue advances to Step 2
        (signers) once a valid document source is set.
      */}
      {step === 1 ? (
        <StepBody>
          <StepInner $wide>
            {!isNewTemplate ? (
              <DocumentTitleRow>
                <DocumentTitle>Document</DocumentTitle>
                <TooltipWrap
                  onMouseEnter={() => setTipOpen(true)}
                  onMouseLeave={() => setTipOpen(false)}
                  onFocus={() => setTipOpen(true)}
                  onBlur={() => setTipOpen(false)}
                >
                  <InfoIconButton
                    type="button"
                    aria-label="What does the document choice mean?"
                    aria-describedby="doc-tip"
                  >
                    <Icon icon={Info} size={14} />
                  </InfoIconButton>
                  {tipOpen ? (
                    <TooltipBubble id="doc-tip" role="tooltip">
                      The saved layout adapts to whichever document you pick.
                    </TooltipBubble>
                  ) : null}
                </TooltipWrap>
              </DocumentTitleRow>
            ) : null}

            {!isNewTemplate ? (
              <Segmented role="radiogroup" aria-label="Document source">
                <SegmentedButton
                  type="button"
                  role="radio"
                  aria-checked={docChoice === 'saved'}
                  tabIndex={docChoice === 'saved' ? 0 : -1}
                  $active={docChoice === 'saved'}
                  onClick={() => setDocChoice('saved')}
                >
                  <Icon icon={Bookmark} size={14} />
                  Use saved document
                </SegmentedButton>
                <SegmentedButton
                  type="button"
                  role="radio"
                  aria-checked={docChoice === 'upload'}
                  tabIndex={docChoice === 'upload' ? 0 : -1}
                  $active={docChoice === 'upload'}
                  onClick={() => setDocChoice('upload')}
                >
                  <Icon icon={UploadCloud} size={14} />
                  Upload a new one
                </SegmentedButton>
              </Segmented>
            ) : null}

            {docChoice === 'saved' && template ? (
              <SavedDocCard>
                <SavedDocCover aria-hidden>
                  <SavedDocStack />
                  <SavedDocStack />
                  <SavedDocPaper>
                    <SavedDocStripe />
                    <SavedDocLine $width={62} />
                    <SavedDocLine $width={73} />
                    <SavedDocLine $width={84} />
                    <SavedDocLine $width={66} />
                    <SavedDocLine $width={78} />
                  </SavedDocPaper>
                </SavedDocCover>
                <SavedDocBody>
                  <SavedDocName>{template.exampleFile || 'Saved example PDF'}</SavedDocName>
                  <SavedDocMeta>
                    <span>{template.pages} pages</span>
                    <span>·</span>
                    <span>{template.fields.length} field rules</span>
                    <span>·</span>
                    <span>Last sent {template.lastUsed || '—'}</span>
                  </SavedDocMeta>
                </SavedDocBody>
                <Button variant="primary" iconRight={ArrowRight} onClick={continueToSigners}>
                  Continue
                </Button>
              </SavedDocCard>
            ) : null}

            {docChoice === 'upload' ? (
              <>
                {pendingFile ? (
                  <SavedDocCard>
                    <SavedDocCover aria-hidden>
                      <SavedDocStack />
                      <SavedDocStack />
                      <SavedDocPaper>
                        <SavedDocStripe />
                        <SavedDocLine $width={62} />
                        <SavedDocLine $width={73} />
                        <SavedDocLine $width={84} />
                      </SavedDocPaper>
                    </SavedDocCover>
                    <SavedDocBody>
                      <SavedDocName>{pendingFile.name}</SavedDocName>
                      <SavedDocMeta>
                        <span>{(pendingFile.size / (1024 * 1024)).toFixed(1)}&nbsp;MB</span>
                        <span>·</span>
                        <span>Ready to use</span>
                      </SavedDocMeta>
                    </SavedDocBody>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setPendingFile(null);
                        setUploadError(null);
                      }}
                    >
                      Replace
                    </Button>
                    <Button variant="primary" iconRight={ArrowRight} onClick={continueToSigners}>
                      Continue
                    </Button>
                  </SavedDocCard>
                ) : (
                  // Reuse the Sign-flow's UploadPage so the secondary
                  // actions row (Drive picker / Connect Drive) lives
                  // INSIDE the dropzone — same layout pattern as
                  // `/document/new`. Pre-2026-05-04 the templates flow
                  // hosted Drive as a wide standalone card below the
                  // dropzone (DriveTemplateReplaceButton); the inline
                  // composition matches the operator design feedback
                  // and treats Drive as a peer of "Choose file".
                  <UploadPage
                    hideHeader={!isNewTemplate}
                    {...(isNewTemplate
                      ? {
                          title: 'Upload an example document',
                          subtitle:
                            "A representative copy works best — we'll use it to place fields. Real documents go in later.",
                        }
                      : {})}
                    dropHeading={template ? 'Drop a different PDF' : 'Drop a sample PDF'}
                    {...(template
                      ? { dropSubheading: 'Saved layout will snap onto it · up to 25 MB' }
                      : {})}
                    onFileSelected={(f) => {
                      setUploadError(null);
                      setPendingFile(f);
                    }}
                    onError={(_, message) => setUploadError(message)}
                    {...(gdriveOn && driveAccountId !== null
                      ? { onPickDrive: () => setDrivePickerOpen(true) }
                      : {})}
                    {...(gdriveOn && driveAccountId === null
                      ? { onConnectDrive: handleConnectDrive }
                      : {})}
                  />
                )}
                {uploadError ? <FooterHint role="alert">{uploadError}</FooterHint> : null}
              </>
            ) : null}
          </StepInner>
        </StepBody>
      ) : null}

      {/*
        STEP 2 — Signers. Centered card with empty pill, ordinal-numbered
        signer rows, and an inline contacts picker. The Continue CTA
        hands off to the place-fields editor (`continueToEditor`),
        which is Step 3 of the wizard but lives at a different route.
      */}
      {step === 2 ? (
        <SignersStepCard
          mode={mode}
          signers={signers}
          contacts={contacts}
          onPickContact={togglePickContact}
          onCreateGuest={createGuestSigner}
          onRemoveSigner={removeSigner}
          onContinue={continueToEditor}
          onBack={() => setStep(1)}
          continueLabel="Continue to fields"
        />
      ) : null}
      {gdriveOn && driveAccountId !== null ? (
        <DrivePicker
          open={drivePickerOpen}
          accountId={driveAccountId}
          onClose={() => setDrivePickerOpen(false)}
          onPick={(file) => {
            setDrivePickerOpen(false);
            driveImport.beginImport(file);
          }}
        />
      ) : null}
      <ConversionProgressDialog
        open={driveImport.state.kind === 'starting' || driveImport.state.kind === 'running'}
        fileName={
          driveImport.state.kind === 'starting' || driveImport.state.kind === 'running'
            ? driveImport.state.file.name
            : ''
        }
        onCancel={() => {
          void driveImport.cancelImport();
        }}
      />
      <ConversionFailedDialog
        open={driveImport.state.kind === 'failed'}
        errorCode={
          driveImport.state.kind === 'failed' ? driveImport.state.error : 'conversion-failed'
        }
        onRetry={() => {
          driveImport.reset();
          setDrivePickerOpen(true);
        }}
        onClose={() => driveImport.reset()}
      />
    </Page>
  );
}
