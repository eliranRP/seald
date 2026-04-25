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
import { SigningSessionProvider, useSigningSession } from '@/features/signing';
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
} from './SigningFillPage.styles';

// Default field box dimensions when the backend didn't send explicit width/
// height (the UI contract uses absolute ratios; the canvas is 560 wide).
const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 740;

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

  if (!envelope) return null;

  return (
    <Page>
      <RecipientHeader
        docTitle={envelope.title}
        docId={envelope.short_code}
        stepLabel={`${completedRequired} of ${requiredCount} fields`}
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
                      ? Math.round(f.width * CANVAS_WIDTH)
                      : DEFAULT_FIELD_W[uiKind];
                    const height = f.height
                      ? Math.round(f.height * CANVAS_HEIGHT)
                      : DEFAULT_FIELD_H[uiKind];
                    const x = f.x > 1 ? f.x : Math.round(f.x * CANVAS_WIDTH);
                    const y = f.y > 1 ? f.y : Math.round(f.y * CANVAS_HEIGHT);
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
