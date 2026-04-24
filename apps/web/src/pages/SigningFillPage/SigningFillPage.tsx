import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, Check } from 'lucide-react';
import { DocumentPageCanvas } from '../../components/DocumentPageCanvas';
import { FieldInputDrawer } from '../../components/FieldInputDrawer';
import type { FieldInputKind } from '../../components/FieldInputDrawer';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';
import { RecipientHeader } from '../../components/RecipientHeader';
import { SignatureCapture } from '../../components/SignatureCapture';
import type { SignatureCaptureResult } from '../../components/SignatureCapture';
import { SignerField } from '../../components/SignerField';
import type { SignerFieldKind } from '../../components/SignerField';
import { SigningSessionProvider, getPdfUrl, useSigningSession } from '../../features/signing';
import type { SignMeField } from '../../features/signing';
import {
  ActionBar,
  DeclineBtn,
  ErrorBanner,
  NextBtn,
  Page,
  PagesStack,
  ProgressCount,
  ProgressWrap,
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

  const totalPages = envelope?.original_pages ?? 1;
  const pdfSrc = getPdfUrl();

  const fieldsByPage = useMemo(() => {
    const byPage = new Map<number, SignMeField[]>();
    for (const f of fields) {
      const list = byPage.get(f.page) ?? [];
      list.push(f);
      byPage.set(f.page, list);
    }
    return byPage;
  }, [fields]);

  const handleFieldClick = useCallback(
    async (field: SignMeField): Promise<void> => {
      setError(null);
      setActiveFieldId(field.id);
      const uiKind = toUiKind(field);
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
        setSigDrawer({ field, kind: uiKind });
        return;
      }
      if (uiKind === 'email' || uiKind === 'date' || uiKind === 'name' || uiKind === 'text') {
        setTextDrawer({ field, kind: uiKind });
      }
    },
    [envelopeId, fillField, navigate],
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

      <PagesStack>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
          const pageFields = fieldsByPage.get(p) ?? [];
          return (
            <DocumentPageCanvas
              key={p}
              pageNum={p}
              totalPages={totalPages}
              title={envelope.title}
              pdfSrc={pdfSrc}
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
