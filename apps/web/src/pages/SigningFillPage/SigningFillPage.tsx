import { useParams } from 'react-router-dom';
import { ArrowDown, Check } from 'lucide-react';
import { DocumentPageCanvas } from '@/components/DocumentPageCanvas';
import { FieldInputDrawer } from '@/components/FieldInputDrawer';
import { Icon } from '@/components/Icon';
import { PageThumbRail } from '@/components/PageThumbRail';
import { PageToolbar } from '@/components/PageToolbar';
import { ProgressBar } from '@/components/ProgressBar';
import { RecipientHeader } from '@/components/RecipientHeader';
import { SignatureCapture } from '@/components/SignatureCapture';
import { SignerField } from '@/components/SignerField';
import type { SignerFieldKind } from '@/components/SignerField';
import { useDownloadPdf } from '@/features/downloadPdf';
import { getPdfSignedUrl, SigningSessionProvider, useSigningSession } from '@/features/signing';
import {
  fieldIsFilled,
  fieldLabel,
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
  NextBtn,
  Page,
  PagesStack,
  ProgressCount,
  ProgressWrap,
  RailSlot,
  ReviewBtn,
  Spacer,
  WithdrawBtn,
} from './SigningFillPage.styles';

import { CANVAS_WIDTH, denormalizeCoord, useCanvasHeight } from '@/lib/canvas-coords';
import { usePdfDocument } from '@/lib/pdf';

const DEFAULT_FIELD_W: Record<SignerFieldKind, number> = {
  signature: 200,
  initials: 80,
  name: 200,
  date: 140,
  text: 240,
  email: 240,
  checkbox: 24,
};
const DEFAULT_FIELD_H: Record<SignerFieldKind, number> = {
  signature: 54,
  initials: 54,
  name: 36,
  date: 36,
  text: 36,
  email: 36,
  checkbox: 24,
};

function Content() {
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';

  const session = useSigningSession();
  const { envelope, fields, completedRequired, requiredCount, allRequiredFilled, nextField } =
    session;

  const totalPages = envelope?.original_pages ?? 1;
  const pdfSrc = useSigningPdfSource(envelope?.id);
  const { doc: signingPdfDoc } = usePdfDocument(pdfSrc);
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
    handleSignatureApply,
    handleReview,
    handleDecline,
    handleWithdrawConsent,
  } = useSigningFillController({ envelopeId });

  // Zoom + scroll-spy + page rail — extracted to a reusable hook (rule 1.1).
  // Reattach the IntersectionObserver when the signed PDF URL resolves (the
  // page DOM that exposes `data-r-page` mounts then).
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

  // Download original (unsigned) PDF — fetches the same short-lived signed
  // URL the viewer uses, wraps it in a Blob, and triggers a hidden-anchor
  // click. Lives at the page level so the busy/error state can drive the
  // header chrome.
  const { download: downloadPdf, busy: downloadBusy } = useDownloadPdf({
    getUrl: () => getPdfSignedUrl(),
    filename: envelope?.title ?? 'document',
  });

  if (!envelope) return null;

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
              label={`${completedRequired} of ${requiredCount} fields complete`}
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
        <DeclineBtn type="button" onClick={handleDecline} disabled={busy}>
          Decline
        </DeclineBtn>
        <WithdrawBtn
          type="button"
          onClick={handleWithdrawConsent}
          disabled={busy}
          title="Withdraw consent to use electronic signatures for this document"
        >
          Withdraw consent
        </WithdrawBtn>
        {!allRequiredFilled && nextField ? (
          <NextBtn type="button" onClick={handleNext}>
            <Icon icon={ArrowDown} size={14} />
            Next field
          </NextBtn>
        ) : null}
        {allRequiredFilled ? (
          <ReviewBtn type="button" onClick={handleReview}>
            <Icon icon={Check} size={14} />
            Review &amp; finish
          </ReviewBtn>
        ) : null}
      </ActionBar>

      {error ? <ErrorBanner role="alert">{error}</ErrorBanner> : null}

      <Center>
        <CenterScroll ref={scrollAreaRef}>
          <PagesStack style={{ transform: `scale(${zoom})` }}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
              const pageFields = fieldsByPage.get(p) ?? [];
              return (
                <DocumentPageCanvas
                  key={p}
                  pageNum={p}
                  totalPages={totalPages}
                  title={envelope.title}
                  pdfSrc={pdfSrc ?? undefined}
                  width={CANVAS_WIDTH}
                >
                  {pageFields.map((f) => {
                    const uiKind = toUiKind(f);
                    const label = fieldLabel(f, uiKind);
                    const width = f.width
                      ? denormalizeCoord(f.width, CANVAS_WIDTH)
                      : DEFAULT_FIELD_W[uiKind];
                    const height = f.height
                      ? denormalizeCoord(f.height, canvasHeight)
                      : DEFAULT_FIELD_H[uiKind];
                    const x = denormalizeCoord(f.x, CANVAS_WIDTH);
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

      <FieldInputDrawer
        open={textDrawer !== null}
        label={textDrawer ? fieldLabel(textDrawer.field, toUiKind(textDrawer.field)) : ''}
        kind={textDrawer?.kind ?? 'text'}
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
