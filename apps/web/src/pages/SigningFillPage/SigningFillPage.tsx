import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { isFeatureEnabled } from 'shared';
import { ArrowDown, Check, ListChecks, MoreVertical } from 'lucide-react';
import { DocumentPageCanvas } from '@/components/DocumentPageCanvas';
import { FieldInputDrawer } from '@/components/FieldInputDrawer';
import type { FieldInputKind } from '@/components/FieldInputDrawer';
import { isReadOnly, usesMetaDrawer } from '@/features/signingFill/inputs/fieldDisplay';
import { MetaFieldDrawer } from '@/features/signingFill/inputs/MetaFieldDrawer';
import type { MetaInputKind } from '@/features/signingFill/inputs/MetaFieldDrawer';
import { Icon } from '@/components/Icon';
import { PageThumbRail } from '@/components/PageThumbRail';
import { PageToolbar } from '@/components/PageToolbar';
import { ProgressBar } from '@/components/ProgressBar';
import { RecipientHeader } from '@/components/RecipientHeader';
import { SignatureCapture } from '@/components/SignatureCapture';
import { SignerField } from '@/components/SignerField';
import type { SignerFieldKind } from '@/components/SignerField';
import { useDownloadPdf } from '@/features/downloadPdf';
import {
  getPdfSignedUrl,
  SigningSessionProvider,
  useSigningSession,
  type SignMeField,
} from '@/features/signing';
import {
  DocumentRail,
  fieldIsFilled,
  fieldLabel,
  summarizeDocuments,
  fieldValue,
  toUiKind,
  useDocumentZoomNav,
  useFieldsByPage,
  useSigningFillController,
  useSigningPdfSource,
} from '@/features/signingFill';
import {
  ActionBar,
  Center,
  CenterScroll,
  DeclineBtn,
  ErrorBanner,
  FieldsPanelBackdrop,
  FieldsPanelItem,
  FieldsPanelSheet,
  FieldsPanelStatus,
  FieldsPanelTitle,
  FieldsToggle,
  NextBtn,
  OptionalDialogBackdrop,
  OptionalDialogBody,
  OptionalDialogCard,
  OptionalDialogFooter,
  OptionalDialogTitle,
  OptionalPrimaryBtn,
  OptionalSecondaryBtn,
  OverflowKebab,
  OverflowMenuBackdrop,
  OverflowMenuDanger,
  OverflowMenuItem,
  OverflowMenuSheet,
  Page,
  PagesStack,
  ProgressCount,
  ProgressWrap,
  RailSlot,
  ReviewBtn,
  Spacer,
  WithdrawBtn,
} from './SigningFillPage.styles';

import {
  CANVAS_WIDTH,
  denormalizeCoord,
  useCanvasHeight,
  useCanvasWidth,
} from '@/lib/canvas-coords';
import { usePdfDocument } from '@/lib/pdf';

const DEFAULT_FIELD_W: Record<SignerFieldKind, number> = {
  signature: 200,
  initials: 80,
  name: 200,
  date: 140,
  text: 240,
  email: 240,
  checkbox: 24,
  number: 140,
  radio: 200,
  dropdown: 200,
};
const DEFAULT_FIELD_H: Record<SignerFieldKind, number> = {
  signature: 54,
  initials: 54,
  name: 36,
  date: 36,
  text: 36,
  email: 36,
  checkbox: 24,
  number: 36,
  radio: 72,
  dropdown: 36,
};

const SUPPORT_EMAIL = 'support@seald.nromomentum.com';

/**
 * Sort comparator for per-page reading order. Required first, then
 * visual top-to-bottom, then left-to-right. Stable for fields with
 * the same y by falling back to x (audit report-B-signer.md,
 * SigningFillPage [HIGH] a11y tab order).
 */
function compareFieldsForReadingOrder(a: SignMeField, b: SignMeField): number {
  // Required-first: required fields come before optional so keyboard
  // users hit every blocker before they get to the nice-to-have inputs.
  if (a.required !== b.required) return a.required ? -1 : 1;
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
}

function Content() {
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';

  const session = useSigningSession();
  const {
    envelope,
    fields: allFields,
    documents,
    completedRequired,
    requiredCount,
    allRequiredFilled,
    nextField,
  } = session;

  // Multi-document envelopes (WP-04). Off, or one document: everything below
  // is the single-document view, untouched.
  const multiDoc = isFeatureEnabled('multiDocumentEnvelopes') && documents.length > 1;
  const [requestedDocumentId, setRequestedDocumentId] = useState<string | null>(null);
  const activeDocument = multiDoc
    ? (documents.find((d) => d.id === requestedDocumentId) ?? documents[0])
    : undefined;
  // `fields` is what the canvas shows: the active document's fields. The
  // progress counts, "Next field" and review keep using every document.
  const fields = useMemo(
    () =>
      activeDocument === undefined
        ? allFields
        : allFields.filter((f) => f.document_id === activeDocument.id),
    [allFields, activeDocument],
  );

  const totalPages = activeDocument?.original_pages ?? envelope?.original_pages ?? 1;
  const pdfSrc = useSigningPdfSource(envelope?.id, activeDocument?.id);
  const { doc: signingPdfDoc } = usePdfDocument(pdfSrc);
  // Mobile canvas overflow fix (audit item 1): width is viewport-aware
  // (`computeCanvasWidth`); height threads the same width through so the
  // aspect ratio stays correct.
  const canvasWidth = useCanvasWidth();
  const canvasHeight = useCanvasHeight(signingPdfDoc);
  const { fieldsByPage, fieldCountByPage } = useFieldsByPage(fields);

  // All field interaction state + handlers (rule 1.5 — page stays thin).
  const {
    activeFieldId,
    textDrawer,
    sigDrawer,
    error,
    busy,
    closeTextDrawer,
    closeSigDrawer,
    handleFieldClick,
    handleNext,
    handleTextApply,
    handleMetaApply,
    drawerError,
    drawerBusy,
    handleSignatureApply,
    handleReview,
    handleDecline,
    handleWithdrawConsent,
  } = useSigningFillController({
    envelopeId,
    activeDocumentId: activeDocument?.id,
    onActiveDocumentChange: multiDoc ? setRequestedDocumentId : undefined,
  });

  // Zoom + scroll-spy + page rail — extracted to a reusable hook (rule 1.1).
  const {
    scrollAreaRef,
    zoom,
    currentPage,
    zoomIn,
    zoomOut,
    resetZoom,
    scrollToPage,
    zoomInDisabled,
    zoomOutDisabled,
  } = useDocumentZoomNav({ totalPages, resetKey: pdfSrc });

  const { download: downloadPdf, busy: downloadBusy } = useDownloadPdf({
    getUrl: () =>
      activeDocument === undefined
        ? getPdfSignedUrl()
        : getPdfSignedUrl(undefined, activeDocument.id),
    filename: activeDocument?.title ?? envelope?.title ?? 'document',
  });

  // Mobile chrome state (audit items 4 + 5).
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [fieldsPanelOpen, setFieldsPanelOpen] = useState(false);

  // Audit item 9 — track whether the user has been prompted about
  // unfilled optional fields. Pre-compute the optional totals from
  // the live field list so they stay in sync with mutations.
  const optionalStats = useMemo(() => {
    let total = 0;
    let filled = 0;
    for (const f of allFields) {
      if (f.required) continue;
      total += 1;
      if (fieldIsFilled(f)) filled += 1;
    }
    return { total, filled, remaining: total - filled };
  }, [allFields]);
  const [optionalPromptOpen, setOptionalPromptOpen] = useState(false);

  // Wrap handleReview so it stops to confirm when optionals are blank
  // (audit item 9). Always allow the user to continue OR jump back to
  // the first unfilled optional field. The hook's handleReview() is the
  // navigation primitive; this layer adds the prompt step.
  const handleReviewClick = useCallback(() => {
    if (optionalStats.remaining > 0) {
      setOptionalPromptOpen(true);
      return;
    }
    handleReview();
  }, [handleReview, optionalStats.remaining]);

  const handleOptionalContinue = useCallback(() => {
    setOptionalPromptOpen(false);
    handleReview();
  }, [handleReview]);

  const handleOptionalGoFill = useCallback(() => {
    setOptionalPromptOpen(false);
    // Jump to the first unfilled optional field — uses the same
    // `data-r-page` scroll-spy as the rest of the navigation.
    const firstOptionalUnfilled = allFields.find((f) => !f.required && !fieldIsFilled(f));
    if (firstOptionalUnfilled) {
      if (
        multiDoc &&
        firstOptionalUnfilled.document_id !== undefined &&
        firstOptionalUnfilled.document_id !== activeDocument?.id
      ) {
        // It sits on another document: bring that one up.
        setRequestedDocumentId(firstOptionalUnfilled.document_id);
        return;
      }
      const el = document.querySelector(`[data-r-page="${firstOptionalUnfilled.page}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [allFields, multiDoc, activeDocument?.id]);

  // Mobile-overflow handlers route to the same hook handlers as the
  // desktop buttons so the audit-trail outcome is identical
  // (decline vs withdraw consent stays distinct).
  const handleOverflowDecline = useCallback(() => {
    setOverflowMenuOpen(false);
    handleDecline().catch(() => {
      /* surfaced via error state */
    });
  }, [handleDecline]);

  const handleOverflowWithdraw = useCallback(() => {
    setOverflowMenuOpen(false);
    handleWithdrawConsent().catch(() => {
      /* surfaced via error state */
    });
  }, [handleWithdrawConsent]);

  const handleOverflowHelp = useCallback(() => {
    setOverflowMenuOpen(false);
    // mailto is the existing support pattern from SigningEntryPage; no
    // in-page help center yet. Encode the envelope id so support can
    // jump straight to the audit chain.
    const subject = encodeURIComponent(`Help with envelope ${envelopeId}`);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}`;
  }, [envelopeId]);

  // Mobile fields panel — jump to a specific field on click.
  const handleFieldsPanelSelect = useCallback(
    (field: SignMeField) => {
      setFieldsPanelOpen(false);
      handleFieldClick(field).catch(() => {
        /* surfaced via error state */
      });
    },
    [handleFieldClick],
  );

  if (!envelope) return null;

  // Audit item 6 — mobile collapses the count into the bar label.
  // The canvas-width hook already runs a resize listener that
  // re-renders this component whenever the viewport changes class,
  // so deriving `isMobile` from its returned width keeps both signals
  // strictly in sync (and avoids a second resize listener).
  const isMobile = canvasWidth < CANVAS_WIDTH;
  const pct = requiredCount > 0 ? Math.round((completedRequired / requiredCount) * 100) : 0;
  const progressLabel = isMobile
    ? `${completedRequired} of ${requiredCount} · ${pct}%`
    : `${completedRequired} of ${requiredCount} fields complete`;

  const nextFieldDocument =
    multiDoc && nextField ? documents.find((d) => d.id === nextField.document_id) : undefined;
  const railItems = multiDoc ? summarizeDocuments(documents, allFields, fieldIsFilled) : [];

  // Audit item 5 — mobile fields panel lists every field on the
  // active page.
  const activePageFields = fieldsByPage.get(currentPage) ?? [];

  return (
    <Page>
      <RecipientHeader
        docTitle={envelope.title}
        docId={envelope.short_code}
        stepLabel={`${completedRequired} of ${requiredCount} fields`}
        downloadPdfBusy={downloadBusy}
        onDownloadPdf={() => {
          downloadPdf().catch(() => {
            /* error surfaced via hook state; intentionally swallowed at
               the click boundary so React's onClick doesn't see an
               unhandled rejection (rule 4.4 — one responsibility). */
          });
        }}
      />
      <ActionBar>
        <ProgressWrap>
          <div style={{ flex: 1 }}>
            <ProgressBar
              value={completedRequired}
              max={Math.max(1, requiredCount)}
              tone={allRequiredFilled ? 'success' : 'indigo'}
              label={progressLabel}
            />
          </div>
          <ProgressCount>
            {completedRequired}/{requiredCount}
          </ProgressCount>
        </ProgressWrap>
        <Spacer />
        <PageToolbar
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={() => scrollToPage(Math.max(1, currentPage - 1))}
          onNextPage={() => scrollToPage(Math.min(totalPages, currentPage + 1))}
          onJumpToNextZone={nextField ? handleNext : undefined}
          jumpLabel="Jump to next required field"
          zoom={zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetZoom={resetZoom}
          zoomInDisabled={zoomInDisabled}
          zoomOutDisabled={zoomOutDisabled}
        />
        {/* Audit item 5 — mobile-only Fields toggle. Rendered conditionally
            on the JS-derived `isMobile` flag rather than via a media-query
            `display: none` so the control is removed from the
            accessibility tree entirely on desktop (avoids a confusing
            "Fields" button that does nothing when no panel exists for
            desktop). */}
        {isMobile ? (
          <FieldsToggle
            type="button"
            onClick={() => setFieldsPanelOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={fieldsPanelOpen}
          >
            <Icon icon={ListChecks} size={14} />
            Fields
          </FieldsToggle>
        ) : null}
        <DeclineBtn type="button" onClick={handleDecline} disabled={busy}>
          Decline
        </DeclineBtn>
        {!isMobile ? (
          <WithdrawBtn
            type="button"
            onClick={handleWithdrawConsent}
            disabled={busy}
            title="Withdraw consent to use electronic signatures for this document"
          >
            Withdraw consent
          </WithdrawBtn>
        ) : null}
        {/* Audit item 4 — mobile-only kebab opens an overflow sheet
            (Decline / Withdraw consent / Need help). */}
        {isMobile ? (
          <OverflowKebab
            type="button"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={overflowMenuOpen}
            onClick={() => setOverflowMenuOpen(true)}
          >
            <Icon icon={MoreVertical} size={18} />
          </OverflowKebab>
        ) : null}
        {!allRequiredFilled && nextField ? (
          <NextBtn
            type="button"
            onClick={handleNext}
            aria-label={`Next field: ${fieldLabel(nextField, toUiKind(nextField))} on page ${
              nextField.page
            }${nextFieldDocument ? ` of ${nextFieldDocument.title}` : ''}`}
          >
            <Icon icon={ArrowDown} size={14} />
            Next field
          </NextBtn>
        ) : null}
        {allRequiredFilled ? (
          <ReviewBtn type="button" onClick={handleReviewClick}>
            <Icon icon={Check} size={14} />
            Review &amp; finish
          </ReviewBtn>
        ) : null}
      </ActionBar>

      {activeDocument !== undefined ? (
        <DocumentRail
          documents={railItems}
          activeId={activeDocument.id}
          onSelect={setRequestedDocumentId}
        />
      ) : null}

      {error ? <ErrorBanner role="alert">{error}</ErrorBanner> : null}

      <Center>
        <CenterScroll ref={scrollAreaRef}>
          <PagesStack $zoom={zoom}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
              const pageFields = fieldsByPage.get(p) ?? [];
              // Audit item 2 — sort per-page fields by (required, y, x)
              // so the DOM order matches reading order, which is what
              // keyboard / AT users rely on for Tab navigation. The
              // sort is on the rendered slice only — `fieldsByPage`
              // and downstream state stay untouched.
              const orderedFields = [...pageFields].sort(compareFieldsForReadingOrder);
              return (
                <DocumentPageCanvas
                  key={p}
                  pageNum={p}
                  totalPages={totalPages}
                  title={activeDocument?.title ?? envelope.title}
                  pdfSrc={pdfSrc ?? undefined}
                  width={canvasWidth}
                >
                  {orderedFields.map((f) => {
                    const uiKind = toUiKind(f);
                    const baseLabel = fieldLabel(f, uiKind);
                    const label = isReadOnly(f) ? `${baseLabel} (read-only)` : baseLabel;
                    const width = f.width
                      ? denormalizeCoord(f.width, canvasWidth)
                      : DEFAULT_FIELD_W[uiKind];
                    const height = f.height
                      ? denormalizeCoord(f.height, canvasHeight)
                      : DEFAULT_FIELD_H[uiKind];
                    const x = denormalizeCoord(f.x, canvasWidth);
                    const y = denormalizeCoord(f.y, canvasHeight);
                    return (
                      <SignerField
                        key={f.id}
                        kind={uiKind}
                        label={label}
                        required={f.required}
                        active={activeFieldId === f.id}
                        filled={fieldIsFilled(f)}
                        value={fieldValue(f)}
                        x={x}
                        y={y}
                        w={width}
                        h={height}
                        onActivate={() => {
                          handleFieldClick(f).catch(() => {
                            /* surfaced via error state */
                          });
                        }}
                      />
                    );
                  })}
                </DocumentPageCanvas>
              );
            })}
          </PagesStack>
        </CenterScroll>
        <RailSlot>
          <PageThumbRail
            totalPages={totalPages}
            currentPage={currentPage}
            onSelectPage={scrollToPage}
            fieldCountByPage={fieldCountByPage}
          />
        </RailSlot>
      </Center>

      {textDrawer !== null && usesMetaDrawer(textDrawer.field) ? (
        <MetaFieldDrawer
          key={textDrawer.field.id}
          open
          label={fieldLabel(textDrawer.field, toUiKind(textDrawer.field))}
          kind={textDrawer.kind as MetaInputKind}
          meta={textDrawer.field.meta}
          initialValue={textDrawer.field.value_text ?? undefined}
          signerName={session.signer?.name}
          dateFormat={envelope?.date_format}
          timezone={envelope?.timezone}
          serverError={drawerError}
          busy={drawerBusy}
          onCancel={closeTextDrawer}
          onApply={(v) => {
            handleMetaApply(v).catch(() => {
              /* surfaced via drawerError */
            });
          }}
        />
      ) : (
        <FieldInputDrawer
          open={textDrawer !== null}
          label={textDrawer ? fieldLabel(textDrawer.field, toUiKind(textDrawer.field)) : ''}
          kind={(textDrawer?.kind ?? 'text') as FieldInputKind}
          initialValue={
            textDrawer && typeof textDrawer.field.value_text === 'string'
              ? textDrawer.field.value_text
              : ''
          }
          onCancel={closeTextDrawer}
          onApply={(v) => {
            handleTextApply(v).catch(() => {
              /* surfaced via error state */
            });
          }}
        />
      )}

      <SignatureCapture
        open={sigDrawer !== null}
        kind={sigDrawer?.kind ?? 'signature'}
        defaultName={session.signer?.name ?? ''}
        email={session.signer?.email ?? ''}
        onCancel={closeSigDrawer}
        onApply={(r) => {
          handleSignatureApply(r).catch(() => {
            /* surfaced via error state */
          });
        }}
      />

      {/* Audit item 4 — mobile overflow menu (kebab → sheet). */}
      {overflowMenuOpen ? (
        <OverflowMenuBackdrop onClick={() => setOverflowMenuOpen(false)}>
          <OverflowMenuSheet
            role="menu"
            aria-label="More actions"
            onClick={(e) => e.stopPropagation()}
          >
            <OverflowMenuDanger type="button" role="menuitem" onClick={handleOverflowDecline}>
              Decline
            </OverflowMenuDanger>
            <OverflowMenuItem type="button" role="menuitem" onClick={handleOverflowWithdraw}>
              Withdraw consent
            </OverflowMenuItem>
            <OverflowMenuItem type="button" role="menuitem" onClick={handleOverflowHelp}>
              Need help
            </OverflowMenuItem>
            <OverflowMenuItem
              type="button"
              role="menuitem"
              onClick={() => setOverflowMenuOpen(false)}
            >
              Cancel
            </OverflowMenuItem>
          </OverflowMenuSheet>
        </OverflowMenuBackdrop>
      ) : null}

      {/* Audit item 5 — mobile fields panel. */}
      {fieldsPanelOpen ? (
        <FieldsPanelBackdrop onClick={() => setFieldsPanelOpen(false)}>
          <FieldsPanelSheet
            role="dialog"
            aria-label="Fields on this page"
            onClick={(e) => e.stopPropagation()}
          >
            <FieldsPanelTitle>Fields on this page</FieldsPanelTitle>
            {activePageFields
              .slice()
              .sort(compareFieldsForReadingOrder)
              .map((f) => {
                const uiKind = toUiKind(f);
                const filled = fieldIsFilled(f);
                let tone: 'filled' | 'required' | 'optional' = 'optional';
                if (filled) tone = 'filled';
                else if (f.required) tone = 'required';
                let toneLabel = 'Optional';
                if (tone === 'filled') toneLabel = 'Filled';
                else if (tone === 'required') toneLabel = 'Required';
                const label = fieldLabel(f, uiKind);
                return (
                  <FieldsPanelItem
                    key={f.id}
                    type="button"
                    onClick={() => handleFieldsPanelSelect(f)}
                  >
                    <span>{label}</span>
                    <FieldsPanelStatus $tone={tone}>{toneLabel}</FieldsPanelStatus>
                  </FieldsPanelItem>
                );
              })}
          </FieldsPanelSheet>
        </FieldsPanelBackdrop>
      ) : null}

      {/* Audit item 9 — optional-fields review prompt. */}
      {optionalPromptOpen ? (
        <OptionalDialogBackdrop onClick={() => setOptionalPromptOpen(false)}>
          <OptionalDialogCard
            role="dialog"
            aria-label="Optional fields blank"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <OptionalDialogTitle>Optional fields blank</OptionalDialogTitle>
            <OptionalDialogBody>
              You have {optionalStats.remaining} optional{' '}
              {optionalStats.remaining === 1 ? 'field' : 'fields'} blank. Continue to review or fill
              them now?
            </OptionalDialogBody>
            <OptionalDialogFooter>
              <OptionalSecondaryBtn type="button" onClick={handleOptionalGoFill}>
                Fill them now
              </OptionalSecondaryBtn>
              <OptionalPrimaryBtn type="button" onClick={handleOptionalContinue}>
                Continue to review
              </OptionalPrimaryBtn>
            </OptionalDialogFooter>
          </OptionalDialogCard>
        </OptionalDialogBackdrop>
      ) : null}
    </Page>
  );
}

/**
 * `/sign/:envelopeId/fill` — multi-page document view with absolute-positioned
 * fields the recipient taps to fill. Handles every field kind via either a
 * text drawer (text / email / date / name), signature capture sheet (signature
 * / initials), or in-place toggle (checkbox).
 */
export function SigningFillPage() {
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  return (
    <SigningSessionProvider envelopeId={envelopeId} senderName={null}>
      <Content />
    </SigningSessionProvider>
  );
}
