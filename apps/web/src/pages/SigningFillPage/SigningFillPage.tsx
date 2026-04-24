import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, Check } from 'lucide-react';
import { DocumentPageCanvas } from '../../components/DocumentPageCanvas';
import { FieldInputDrawer } from '../../components/FieldInputDrawer';
import type { FieldInputKind } from '../../components/FieldInputDrawer';
import { Icon } from '../../components/Icon';
import { PageThumbRail } from '../../components/PageThumbRail';
import { PageToolbar } from '../../components/PageToolbar';
import { ProgressBar } from '../../components/ProgressBar';
import { RecipientHeader } from '../../components/RecipientHeader';
import { SignatureCapture } from '../../components/SignatureCapture';
import type { SignatureCaptureResult } from '../../components/SignatureCapture';
import { SignerField } from '../../components/SignerField';
import type { SignerFieldKind } from '../../components/SignerField';
import { SigningSessionProvider, getPdfSignedUrl, useSigningSession } from '../../features/signing';
import type { SignMeField } from '../../features/signing';
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

interface ApiErrorLike extends Error {
  status?: number;
}

// Default field box dimensions when the backend didn't send explicit width/
// height (the UI contract uses absolute ratios; the canvas is 560 wide).
const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = 740;

// Zoom range matches the sender prep page so muscle memory carries over.
// 25% granularity is what Acrobat/Preview use by default.
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;
const ZOOM_DEFAULT = 1;
function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}
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

function toUiKind(f: SignMeField): SignerFieldKind {
  // wire kind + link_id "name" convention — we don't have a dedicated wire
  // kind for "name", so the sender marks name fields via link_id.
  if (f.kind === 'text' && f.link_id === 'name') return 'name';
  return f.kind;
}

function fieldLabel(f: SignMeField, uiKind: SignerFieldKind): string {
  const map: Record<SignerFieldKind, string> = {
    signature: 'Sign here',
    initials: 'Initials',
    name: 'Print name',
    date: 'Date',
    text: 'Text',
    email: 'Email',
    checkbox: 'Checkbox',
  };
  return f.link_id && f.link_id !== 'name' ? f.link_id : map[uiKind];
}

function fieldIsFilled(f: SignMeField): boolean {
  if (f.kind === 'checkbox') return f.value_boolean === true;
  return Boolean(f.value_text);
}

function fieldValue(f: SignMeField): string | boolean | null {
  if (f.kind === 'checkbox') return f.value_boolean ?? null;
  return f.value_text ?? null;
}

function scrollToField(field: SignMeField): void {
  const el = document.querySelector(`[data-r-page="${field.page}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Content() {
  const navigate = useNavigate();
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';

  const session = useSigningSession();
  const {
    envelope,
    fields,
    completedRequired,
    requiredCount,
    allRequiredFilled,
    nextField,
    fillField,
    setSignature,
    decline,
  } = session;

  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [textDrawer, setTextDrawer] = useState<{
    readonly field: SignMeField;
    readonly kind: FieldInputKind;
  } | null>(null);
  const [sigDrawer, setSigDrawer] = useState<{
    readonly field: SignMeField;
    readonly kind: 'signature' | 'initials';
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ------ zoom + pages-rail (mirror sender prep affordances) ------
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);
  const resetZoom = useCallback(() => setZoom(ZOOM_DEFAULT), []);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const scrollToPage = useCallback((pageNum: number): void => {
    const el = document.querySelector<HTMLElement>(`[data-r-page="${pageNum}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Remembered signature: first signature capture seeds this, subsequent
  // signature/initials fields auto-apply without reopening the drawer.
  // Clearing is manual (user taps a filled signature field to re-edit,
  // handled by the drawer's normal open path when sigDrawer is set).
  const lastSigResultRef = useRef<SignatureCaptureResult | null>(null);

  const totalPages = envelope?.original_pages ?? 1;
  // Signed URL expires after 90s — refetch when the envelope identity
  // changes (practically: once per signing session). pdf.js then loads
  // the URL with no credentials (auth is in the URL itself), sidestepping
  // the Supabase/browser cross-origin-credentials CORS failure we'd hit
  // by redirect-following /sign/pdf.
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  const envelopeIdForPdf = envelope?.id;
  useEffect(() => {
    if (!envelopeIdForPdf) {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = await getPdfSignedUrl();
        if (!cancelled) setPdfSrc(url);
      } catch {
        /* DocumentPageCanvas renders a graceful placeholder on null. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [envelopeIdForPdf]);

  const fieldsByPage = useMemo(() => {
    const byPage = new Map<number, SignMeField[]>();
    for (const f of fields) {
      const list = byPage.get(f.page) ?? [];
      list.push(f);
      byPage.set(f.page, list);
    }
    return byPage;
  }, [fields]);

  // For the PageThumbRail — count placed fields per page so each thumb
  // shows its workload at a glance.
  const fieldCountByPage = useMemo(() => {
    const out: Record<number, number> = {};
    for (const f of fields) out[f.page] = (out[f.page] ?? 0) + 1;
    return out;
  }, [fields]);

  // Track the top-most visible page so the rail can highlight it. Uses
  // IntersectionObserver rather than scroll math so it survives zoom.
  useEffect(() => {
    const scrollRoot = scrollAreaRef.current;
    if (!scrollRoot) return undefined;
    const nodes = scrollRoot.querySelectorAll<HTMLElement>('[data-r-page]');
    if (nodes.length === 0) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        // Pick the entry with the highest intersection ratio — that's the
        // one the user is looking at right now.
        let best: { page: number; ratio: number } | null = null;
        for (const e of entries) {
          if (e.isIntersecting) {
            const p = Number(e.target.getAttribute('data-r-page'));
            if (p && (!best || e.intersectionRatio > best.ratio)) {
              best = { page: p, ratio: e.intersectionRatio };
            }
          }
        }
        if (best) setCurrentPage(best.page);
      },
      { root: scrollRoot, threshold: [0.25, 0.5, 0.75] },
    );
    nodes.forEach((n) => obs.observe(n));
    return () => obs.disconnect();
    // `totalPages` changes when the envelope finishes loading — reattach
    // so we observe the freshly-mounted page DOM.
  }, [totalPages, pdfSrc]);

  const handleFieldClick = useCallback(
    async (field: SignMeField): Promise<void> => {
      setError(null);
      setActiveFieldId(field.id);
      const uiKind = toUiKind(field);
      // Scroll to field so it's visible before any drawer opens / auto-apply fires.
      scrollToField(field);
      if (uiKind === 'checkbox') {
        try {
          await fillField(field.id, { value_boolean: !fieldIsFilled(field) });
        } catch (err) {
          const e = err as ApiErrorLike;
          if (e.status === 401 || e.status === 410) {
            navigate(`/sign/${envelopeId}`, { replace: true });
            return;
          }
          setError(e.message ?? 'Could not save that change. Please try again.');
        }
        return;
      }
      if (uiKind === 'signature' || uiKind === 'initials') {
        // Reuse the signer's last choice on subsequent fields so they
        // don't have to re-type / re-draw / re-upload the same mark per
        // field. First field always opens the drawer to capture intent.
        const remembered = lastSigResultRef.current;
        if (remembered) {
          try {
            await setSignature(field.id, {
              blob: remembered.blob,
              format: remembered.format,
              ...(remembered.font !== undefined ? { font: remembered.font } : {}),
              ...(remembered.stroke_count !== undefined
                ? { stroke_count: remembered.stroke_count }
                : {}),
              ...(remembered.source_filename !== undefined
                ? { source_filename: remembered.source_filename }
                : {}),
            });
          } catch (err) {
            const e = err as ApiErrorLike;
            if (e.status === 401 || e.status === 410) {
              navigate(`/sign/${envelopeId}`, { replace: true });
              return;
            }
            setError(e.message ?? 'Could not apply your signature. Please try again.');
          }
          return;
        }
        setSigDrawer({ field, kind: uiKind });
        return;
      }
      if (uiKind === 'email' || uiKind === 'date' || uiKind === 'name' || uiKind === 'text') {
        setTextDrawer({ field, kind: uiKind });
      }
    },
    [envelopeId, fillField, navigate, setSignature],
  );

  const handleNext = useCallback(() => {
    if (!nextField) return;
    scrollToField(nextField);
    handleFieldClick(nextField).catch(() => {
      /* surfaced by handleFieldClick's own error state */
    });
  }, [handleFieldClick, nextField]);

  const handleTextApply = useCallback(
    async (value: string): Promise<void> => {
      if (!textDrawer) return;
      const { id } = textDrawer.field;
      setTextDrawer(null);
      try {
        await fillField(id, { value_text: value });
      } catch (err) {
        const e = err as ApiErrorLike;
        if (e.status === 401 || e.status === 410) {
          navigate(`/sign/${envelopeId}`, { replace: true });
          return;
        }
        setError(e.message ?? 'Could not save that field. Please try again.');
      }
    },
    [envelopeId, fillField, navigate, textDrawer],
  );

  const handleSignatureApply = useCallback(
    async (result: SignatureCaptureResult): Promise<void> => {
      if (!sigDrawer) return;
      const { id } = sigDrawer.field;
      setSigDrawer(null);
      // Remember the signer's choice so the next signature/initials
      // field auto-applies without reopening the drawer.
      lastSigResultRef.current = result;
      try {
        // Drop undefined optional fields so `exactOptionalPropertyTypes` is happy.
        await setSignature(id, {
          blob: result.blob,
          format: result.format,
          ...(result.font !== undefined ? { font: result.font } : {}),
          ...(result.stroke_count !== undefined ? { stroke_count: result.stroke_count } : {}),
          ...(result.source_filename !== undefined
            ? { source_filename: result.source_filename }
            : {}),
        });
      } catch (err) {
        const e = err as ApiErrorLike;
        if (e.status === 401 || e.status === 410) {
          navigate(`/sign/${envelopeId}`, { replace: true });
          return;
        }
        if (e.status === 413) {
          setError('That signature image is too large (max 512 KB). Please try a smaller image.');
          return;
        }
        setError(e.message ?? 'Could not save your signature. Please try again.');
      }
    },
    [envelopeId, navigate, setSignature, sigDrawer],
  );

  const handleReview = useCallback(() => {
    navigate(`/sign/${envelopeId}/review`);
  }, [envelopeId, navigate]);

  const handleDecline = useCallback(async () => {
    if (busy) return;
    // eslint-disable-next-line no-alert -- native confirm is appropriate here; a custom dialog is over-engineering for a destructive signer action.
    const confirmed = window.confirm(
      'Decline this signing request? The sender will be notified and the document will remain unsigned.',
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await decline('declined-on-fill');
      navigate(`/sign/${envelopeId}/declined`, { replace: true });
    } catch {
      setBusy(false);
    }
  }, [busy, decline, envelopeId, navigate]);

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
          zoomInDisabled={zoom >= ZOOM_MAX - 1e-6}
          zoomOutDisabled={zoom <= ZOOM_MIN + 1e-6}
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
        onCancel={() => setTextDrawer(null)}
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
        onCancel={() => setSigDrawer(null)}
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
