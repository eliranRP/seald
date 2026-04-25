import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FieldInputKind } from '@/components/FieldInputDrawer';
import type { SignatureCaptureResult } from '@/components/SignatureCapture';
import type { SignerFieldKind } from '@/components/SignerField';
import { useSigningSession } from '@/features/signing';
import type { SignMeField } from '@/features/signing';

interface ApiErrorLike extends Error {
  status?: number;
}

interface TextDrawerState {
  readonly field: SignMeField;
  readonly kind: FieldInputKind;
}

interface SigDrawerState {
  readonly field: SignMeField;
  readonly kind: 'signature' | 'initials';
}

export function toUiKind(f: SignMeField): SignerFieldKind {
  // wire kind + link_id "name" convention — we don't have a dedicated wire
  // kind for "name", so the sender marks name fields via link_id.
  if (f.kind === 'text' && f.link_id === 'name') return 'name';
  return f.kind;
}

export function fieldIsFilled(f: SignMeField): boolean {
  if (f.kind === 'checkbox') return f.value_boolean === true;
  return Boolean(f.value_text);
}

export function fieldValue(f: SignMeField): string | boolean | null {
  if (f.kind === 'checkbox') return f.value_boolean ?? null;
  return f.value_text ?? null;
}

const FIELD_LABEL_BY_KIND: Record<SignerFieldKind, string> = {
  signature: 'Sign here',
  initials: 'Initials',
  name: 'Print name',
  date: 'Date',
  text: 'Text',
  email: 'Email',
  checkbox: 'Checkbox',
};

export function fieldLabel(f: SignMeField, uiKind: SignerFieldKind): string {
  return f.link_id && f.link_id !== 'name' ? f.link_id : FIELD_LABEL_BY_KIND[uiKind];
}

function scrollToField(field: SignMeField): void {
  const el = document.querySelector(`[data-r-page="${field.page}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface UseSigningFillControllerArgs {
  readonly envelopeId: string;
}

interface UseSigningFillControllerReturn {
  readonly activeFieldId: string | null;
  readonly textDrawer: TextDrawerState | null;
  readonly sigDrawer: SigDrawerState | null;
  readonly error: string | null;
  readonly busy: boolean;
  readonly closeTextDrawer: () => void;
  readonly closeSigDrawer: () => void;
  readonly handleFieldClick: (field: SignMeField) => Promise<void>;
  readonly handleNext: () => void;
  readonly handleTextApply: (value: string) => Promise<void>;
  readonly handleSignatureApply: (result: SignatureCaptureResult) => Promise<void>;
  readonly handleReview: () => void;
  readonly handleDecline: () => Promise<void>;
}

/**
 * Owns the signing fill flow's interactive state — drawers, error banner,
 * remembered signatures, and all field/decline/review handlers. The page
 * provides only `envelopeId`; everything else flows through `useSigningSession`.
 *
 * Extracted from `pages/SigningFillPage` per FSD rule 1.5 (pages stay thin).
 */
export function useSigningFillController({
  envelopeId,
}: UseSigningFillControllerArgs): UseSigningFillControllerReturn {
  const navigate = useNavigate();
  const { fillField, setSignature, decline, nextField } = useSigningSession();

  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [textDrawer, setTextDrawer] = useState<TextDrawerState | null>(null);
  const [sigDrawer, setSigDrawer] = useState<SigDrawerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Remembered signature/initials — TWO separate slots because the user
  // typically wants different marks for each kind (full name on a signature
  // field, "EA" on an initials field). Sharing one slot would apply the
  // initials blob to every signature field too. Keyed by the drawer kind
  // so the next same-kind field auto-applies while the opposite kind still
  // prompts for capture.
  const lastByKindRef = useRef<Partial<Record<'signature' | 'initials', SignatureCaptureResult>>>(
    {},
  );

  const closeTextDrawer = useCallback(() => setTextDrawer(null), []);
  const closeSigDrawer = useCallback(() => setSigDrawer(null), []);

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
        // Reuse the signer's last choice on subsequent SAME-KIND fields so
        // they don't have to re-type / re-draw / re-upload the same mark per
        // field. First field of each kind always opens the drawer to capture
        // intent. Signature and initials each keep their own memory.
        const remembered = lastByKindRef.current[uiKind];
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

  // "Next field" / jump-to-next-zone: scroll + highlight only. We deliberately
  // do NOT open a drawer or auto-apply a remembered signature here — that's
  // reserved for an explicit tap on the field itself. Navigation should never
  // mutate document state.
  const handleNext = useCallback((): void => {
    if (!nextField) return;
    scrollToField(nextField);
    setActiveFieldId(nextField.id);
  }, [nextField]);

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
      const { kind } = sigDrawer;
      setSigDrawer(null);
      // Remember the signer's choice per kind so the next same-kind field
      // auto-applies without reopening the drawer. A signature field's result
      // never leaks into the initials slot.
      lastByKindRef.current[kind] = result;
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

  const handleReview = useCallback((): void => {
    navigate(`/sign/${envelopeId}/review`);
  }, [envelopeId, navigate]);

  const handleDecline = useCallback(async (): Promise<void> => {
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

  return {
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
  };
}
