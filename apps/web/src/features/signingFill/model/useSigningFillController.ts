import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FieldInputKind } from '@/components/FieldInputDrawer';
import {
  deriveInitialsFromName,
  getTypedPreference,
  typedCaptureResult,
} from '@/components/SignatureCapture';
import type { SignatureCaptureResult } from '@/components/SignatureCapture';
import type { SignerFieldKind } from '@/components/SignerField';
import { isFeatureEnabled } from 'shared';
import { useSigningSession } from '@/features/signing';
import type { SignMeField } from '@/features/signing';
import { useT } from '@/lib/i18n';
import type { CommonKey, TFn } from '@/lib/i18n';
import { translate } from '@/lib/i18n/useT';
import {
  displayText,
  isReadOnly,
  metaLabel,
  readOnlyDefault,
  usesMetaDrawer,
} from '../inputs/fieldDisplay';
import { fillErrorMessage } from '../inputs/fillErrors';
import { nextTodoField } from './fieldOrder';
import type { MetaInputKind } from '../inputs/MetaFieldDrawer';

interface ApiErrorLike extends Error {
  status?: number;
}

interface TextDrawerState {
  readonly field: SignMeField;
  /** The legacy four, plus number, radio and dropdown while `fieldMetaV2` is on. */
  readonly kind: FieldInputKind | MetaInputKind;
}

interface SigDrawerState {
  readonly field: SignMeField;
  readonly kind: 'signature' | 'initials';
}

export function toUiKind(f: SignMeField): SignerFieldKind {
  // wire kind + link_id "name" convention — we don't have a dedicated wire
  // kind for "name", so the sender marks name fields via link_id.
  if (f.kind === 'text' && f.link_id === 'name') return 'name';
  // name, number, radio and dropdown are real wire kinds while `fieldMetaV2` is on.
  return f.kind;
}

export function fieldIsFilled(f: SignMeField): boolean {
  if (f.kind === 'checkbox') return f.value_boolean === true;
  return Boolean(f.value_text);
}

export function fieldValue(f: SignMeField): string | boolean | null {
  if (f.kind === 'checkbox') return f.value_boolean ?? null;
  // Numbers in their format and choices by label (flag `fieldMetaV2`); the
  // stored text otherwise.
  return displayText(f) ?? f.value_text ?? null;
}

const FIELD_LABEL_KEY: Record<SignerFieldKind, CommonKey> = {
  signature: 'signing.fieldLabel.signature',
  initials: 'signing.fieldLabel.initials',
  name: 'signing.fieldLabel.name',
  date: 'signing.fieldLabel.date',
  text: 'signing.fieldLabel.text',
  email: 'signing.fieldLabel.email',
  checkbox: 'signing.fieldLabel.checkbox',
  number: 'signing.fieldLabel.number',
  radio: 'signing.fieldLabel.radio',
  dropdown: 'signing.fieldLabel.dropdown',
};

export function fieldLabel(f: SignMeField, uiKind: SignerFieldKind, t: TFn = translate): string {
  const custom = metaLabel(f);
  if (custom !== undefined) return custom;
  return f.link_id && f.link_id !== 'name' ? f.link_id : t(FIELD_LABEL_KEY[uiKind]);
}

function scrollToField(field: SignMeField): void {
  const el = document.querySelector(`[data-r-page="${field.page}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface UseSigningFillControllerArgs {
  readonly envelopeId: string;
  /**
   * Multi-document envelopes (WP-04): the document on screen and the way to
   * switch it. When both are given, "Next field" and the auto-advance after
   * a fill switch to the document that holds the target field first, then
   * scroll to it. Omitted for a single-document envelope.
   */
  readonly activeDocumentId?: string | undefined;
  readonly onActiveDocumentChange?: ((documentId: string) => void) | undefined;
  /** Fields ignore taps while the signer has not started (consent not given yet). */
  readonly locked?: boolean | undefined;
}

interface UseSigningFillControllerReturn {
  readonly activeFieldId: string | null;
  readonly textDrawer: TextDrawerState | null;
  readonly sigDrawer: SigDrawerState | null;
  readonly error: string | null;
  readonly closeTextDrawer: () => void;
  readonly closeSigDrawer: () => void;
  readonly handleFieldClick: (field: SignMeField) => Promise<void>;
  /** Scrolls to a field and marks it as the current one. */
  readonly goTo: (field: SignMeField) => void;
  readonly handleTextApply: (value: string) => Promise<void>;
  /**
   * Meta-aware drawers (flag `fieldMetaV2`): fills, and keeps the drawer
   * open with `drawerError` set when the API refuses the value.
   */
  readonly handleMetaApply: (value: string) => Promise<void>;
  readonly drawerError: string | null;
  readonly drawerBusy: boolean;
  readonly handleSignatureApply: (result: SignatureCaptureResult) => Promise<void>;
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
  activeDocumentId,
  onActiveDocumentChange,
  locked = false,
}: UseSigningFillControllerArgs): UseSigningFillControllerReturn {
  const navigate = useNavigate();
  const t = useT();
  const { fillField, setSignature, fields, documents, signer } = useSigningSession();
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [drawerBusy, setDrawerBusy] = useState(false);

  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [textDrawer, setTextDrawer] = useState<TextDrawerState | null>(null);
  const [sigDrawer, setSigDrawer] = useState<SigDrawerState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Remembered signature/initials — TWO separate slots because the user
  // typically wants different marks for each kind (full name on a signature
  // field, "EA" on an initials field). Sharing one slot would apply the
  // initials blob to every signature field too. Keyed by the drawer kind
  // so the next same-kind field auto-applies while the opposite kind still
  // prompts for capture.
  const lastByKindRef = useRef<Partial<Record<'signature' | 'initials', SignatureCaptureResult>>>(
    {},
  );

  // A field on another document can only be scrolled to once that document's
  // pages are on screen, so the scroll waits for the switch to commit.
  const pendingFocusRef = useRef<SignMeField | null>(null);
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending === null || pending.document_id !== activeDocumentId) return;
    pendingFocusRef.current = null;
    scrollToField(pending);
  }, [activeDocumentId]);

  /** Scrolls to a field, switching document first when it sits on another one. */
  function focusField(field: SignMeField): void {
    if (
      onActiveDocumentChange !== undefined &&
      field.document_id !== undefined &&
      field.document_id !== activeDocumentId
    ) {
      pendingFocusRef.current = field;
      onActiveDocumentChange(field.document_id);
      return;
    }
    scrollToField(field);
  }

  // Read-only fields (flag `fieldMetaV2`) show the sender's default and the
  // signer cannot change them, so they are filled with that default once,
  // which is the only value the API accepts for them.
  const autoFilledRef = useRef<Set<string>>(new Set());
  const fillFieldRef = useRef(fillField);
  useEffect(() => {
    fillFieldRef.current = fillField;
  });
  useEffect(() => {
    if (!isFeatureEnabled('fieldMetaV2')) return;
    for (const f of fields) {
      if (f.kind === 'checkbox' || f.kind === 'signature' || f.kind === 'initials') continue;
      if (!isReadOnly(f) || fieldIsFilled(f) || autoFilledRef.current.has(f.id)) continue;
      const def = readOnlyDefault(f);
      if (def === null) continue;
      autoFilledRef.current.add(f.id);
      fillFieldRef.current(f.id, { value_text: def }).catch((err: unknown) => {
        autoFilledRef.current.delete(f.id);
        setError(fillErrorMessage((err as ApiErrorLike).message ?? '', f.meta, t));
      });
    }
  }, [fields, t]);

  const closeTextDrawer = useCallback(() => {
    setTextDrawer(null);
    setDrawerError(null);
  }, []);
  const closeSigDrawer = useCallback(() => setSigDrawer(null), []);

  /**
   * Auto-advance: after a successful field apply, scroll to and
   * activate the next required unfilled field. Skips the just-filled
   * id so a stale closure (which still sees the field as unfilled)
   * doesn't ping-pong back to the same field.
   *
   * Implements the "should move automatically to the next place where
   * the user should click to sign" feature — replaces the manual
   * tap-on-the-pill flow that used to require operator effort
   * between every field. Plain functions (not memoized) so they always
   * close over the freshest `fields` snapshot; the callbacks that
   * invoke them list `fields` in their deps so the captured helpers
   * stay current.
   */
  function findNextAfter(skipId: string): SignMeField | null {
    return nextTodoField(fields, documents, skipId);
  }
  function advanceTo(target: SignMeField | null): void {
    if (!target) return;
    focusField(target);
    setActiveFieldId(target.id);
  }

  const handleFieldClick = useCallback(
    async (field: SignMeField): Promise<void> => {
      if (locked) return;
      setError(null);
      setActiveFieldId(field.id);
      const uiKind = toUiKind(field);
      // A read-only field is not editable by the signer.
      if (isReadOnly(field)) return;
      if (uiKind === 'checkbox') {
        // Toggling a checkbox FROM filled→unfilled shouldn't auto-
        // advance — the user is correcting a mistake, not progressing.
        // Only chase the next field when the click filled the box.
        const willBeFilled = !fieldIsFilled(field);
        try {
          await fillField(field.id, { value_boolean: willBeFilled });
        } catch (err) {
          const e = err as ApiErrorLike;
          if (e.status === 401 || e.status === 410) {
            navigate(`/sign/${envelopeId}`, { replace: true });
            return;
          }
          setError(e.message ?? t('signing.fill.errorCheckbox'));
          return;
        }
        if (willBeFilled) advanceTo(findNextAfter(field.id));
        return;
      }
      if (uiKind === 'signature' || uiKind === 'initials') {
        // If the field is already filled, always re-open the drawer so
        // the user can change their signature/initials. Previously,
        // filled fields would silently re-apply the remembered value
        // with no way to edit.
        if (fieldIsFilled(field)) {
          setSigDrawer({ field, kind: uiKind });
          return;
        }
        // For unfilled fields: reuse the signer's last choice on
        // subsequent SAME-KIND fields so they don't have to re-type /
        // re-draw / re-upload the same mark per field. First field of
        // each kind always opens the drawer to capture intent.
        let remembered = lastByKindRef.current[uiKind];
        // Initials come from the name with no sheet: one tap and they are on the page.
        if (!remembered && uiKind === 'initials' && signer) {
          const text =
            getTypedPreference({ email: signer.email, kind: 'initials' }) ??
            deriveInitialsFromName(signer.name);
          if (text.trim().length > 0) {
            try {
              remembered = await typedCaptureResult(text, 'initials');
              lastByKindRef.current.initials = remembered;
            } catch {
              remembered = undefined;
            }
          }
        }
        if (remembered) {
          try {
            await setSignature(field.id, {
              blob: remembered.blob,
              format: remembered.format,
              kind: uiKind,
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
            setError(e.message ?? t('signing.fill.errorSignature'));
            return;
          }
          advanceTo(findNextAfter(field.id));
          return;
        }
        setSigDrawer({ field, kind: uiKind });
        return;
      }
      if (usesMetaDrawer(field)) {
        setDrawerError(null);
        setTextDrawer({ field, kind: uiKind as MetaInputKind });
        return;
      }
      if (uiKind === 'email' || uiKind === 'date' || uiKind === 'name' || uiKind === 'text') {
        // Same for text fields: always re-open the drawer so the user
        // can edit their previous input.
        setTextDrawer({ field, kind: uiKind });
      }
    },
    // the inline `findNextAfter`/`advanceTo` close over `fields`; listed here so the callback re-binds when fields change instead of running against a stale snapshot.
    [
      envelopeId,
      fillField,
      navigate,
      setSignature,
      fields,
      signer,
      locked,
      activeDocumentId,
      onActiveDocumentChange,
      t,
    ],
  );

  // "Next": scroll + highlight only. Navigation never mutates document state,
  // so no drawer opens and no remembered signature is applied here.
  const goTo = useCallback(
    (field: SignMeField): void => {
      focusField(field);
      setActiveFieldId(field.id);
      // `focusField` is an inline helper over the current document state; it is re-created every render so is not listed.
    },
    [activeDocumentId, onActiveDocumentChange],
  );

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
        setError(e.message ?? t('signing.fill.errorField'));
        return;
      }
      // Auto-advance after a successful text fill.
      advanceTo(findNextAfter(id));
    },
    // `advanceTo`/`findNextAfter` are inline helpers that close over `fields`; that closure is refreshed on every render so we don't list them.
    [
      envelopeId,
      fillField,
      navigate,
      textDrawer,
      fields,
      activeDocumentId,
      onActiveDocumentChange,
      t,
    ],
  );

  const handleMetaApply = useCallback(
    async (value: string): Promise<void> => {
      if (!textDrawer || drawerBusy) return;
      const { field } = textDrawer;
      setDrawerBusy(true);
      try {
        await fillField(field.id, { value_text: value });
      } catch (err) {
        const e = err as ApiErrorLike;
        setDrawerBusy(false);
        if (e.status === 401 || e.status === 410) {
          navigate(`/sign/${envelopeId}`, { replace: true });
          return;
        }
        setDrawerError(
          fillErrorMessage(e.message ?? '', field.meta, t) || t('signing.fill.errorField'),
        );
        return;
      }
      setDrawerBusy(false);
      setDrawerError(null);
      setTextDrawer(null);
      advanceTo(findNextAfter(field.id));
    },
    // `advanceTo`/`findNextAfter` are inline helpers that close over `fields`; refreshed on every render.
    [
      drawerBusy,
      envelopeId,
      fillField,
      navigate,
      textDrawer,
      fields,
      activeDocumentId,
      onActiveDocumentChange,
      t,
    ],
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
        // `kind` is essential — without it the backend writes both signature
        // and initials uploads to the same path and the burn-in pipeline
        // ends up rendering the same image at every field placement.
        await setSignature(id, {
          blob: result.blob,
          format: result.format,
          kind,
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
          setError(t('signing.fill.signatureTooLarge'));
          return;
        }
        setError(e.message ?? t('signing.fill.errorSignatureSave'));
        return;
      }
      // Auto-advance after a successful signature/initials apply.
      advanceTo(findNextAfter(id));
    },
    // `advanceTo`/`findNextAfter` are inline helpers that close over `fields`; that closure is refreshed on every render so we don't list them.
    [
      envelopeId,
      navigate,
      setSignature,
      sigDrawer,
      fields,
      activeDocumentId,
      onActiveDocumentChange,
      t,
    ],
  );

  return {
    activeFieldId,
    textDrawer,
    sigDrawer,
    error,
    closeTextDrawer,
    closeSigDrawer,
    handleFieldClick,
    goTo,
    handleTextApply,
    handleMetaApply,
    drawerError,
    drawerBusy,
    handleSignatureApply,
  };
}
