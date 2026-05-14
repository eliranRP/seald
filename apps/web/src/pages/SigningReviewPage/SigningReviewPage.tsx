import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { ErrorBanner as SharedErrorBanner } from '@/components/shared/ErrorBanner';
import { Info, PenTool } from 'lucide-react';
import { FieldInputDrawer } from '@/components/FieldInputDrawer';
import type { FieldInputKind } from '@/components/FieldInputDrawer/FieldInputDrawer.types';
import { Icon } from '@/components/Icon';
import { RecipientHeader } from '@/components/RecipientHeader';
import { ReviewList } from '@/components/ReviewList';
import type { ReviewItem, ReviewFieldKind } from '@/components/ReviewList';
import { SignatureCapture } from '@/components/SignatureCapture';
import type { SignatureCaptureKind, SignatureCaptureResult } from '@/components/SignatureCapture';
import { SignatureMark } from '@/components/SignatureMark';
import { SigningSessionProvider, useSigningSession } from '@/features/signing';
import type { SignMeField } from '@/features/signing';

const Page = styled.div`
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[100]};
  font-family: ${({ theme }) => theme.font.sans};
`;

const Inner = styled.div`
  max-width: 560px;
  margin: 0 auto;
  padding: 48px 24px 80px;
`;

const Heading = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  /* Item 15 — 36px matches theme.font.size.h2 exactly. */
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
`;

const Helper = styled.p`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => theme.space[3]} 0 ${({ theme }) => theme.space[6]};
  line-height: 1.6;
`;

const Legal = styled.div`
  margin-top: ${({ theme }) => theme.space[6]};
  padding: 14px 16px;
  background: ${({ theme }) => theme.color.indigo[50]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.indigo[700]};
  line-height: 1.55;
  display: flex;
  gap: 10px;
  align-items: flex-start;
`;

const IntentRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: ${({ theme }) => theme.space[5]};
  padding: 12px 14px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
  line-height: 1.55;
  cursor: pointer;
`;

const IntentCheckbox = styled.input`
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: ${({ theme }) => theme.color.ink[900]};
  cursor: pointer;
  /* Item 13 — explicit focus ring; mirrors the prep-page Checkbox fix
     (item 6) so keyboard focus is unambiguous on small targets. */
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

const Actions = styled.div`
  margin-top: ${({ theme }) => theme.space[6]};
  display: flex;
  gap: 10px;
`;

const BackBtn = styled.button`
  flex: 1;
  height: 48px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: pointer;
`;

const SubmitBtn = styled.button`
  flex: 2;
  height: 48px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  &:disabled {
    background: ${({ theme }) => theme.color.ink[300]};
    cursor: not-allowed;
  }
`;

/**
 * Issue #41 — Withdraw-consent affordance promised by ESIGN Disclosure §3.
 * Visually quiet text link below the primary actions; mirrors the prep
 * page's WithdrawLink so the control is reachable from every signing
 * step (prep / fill / review).
 */
const WithdrawLink = styled.button`
  margin-top: ${({ theme }) => theme.space[4]};
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.regular};
  text-align: center;
  display: block;
  width: 100%;
  cursor: pointer;
  text-decoration: underline;
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

const ErrorBanner = styled(SharedErrorBanner)`
  margin-top: ${({ theme }) => theme.space[4]};
`;

interface ApiErrorLike extends Error {
  status?: number;
}

function toUiKind(f: SignMeField): ReviewFieldKind {
  if (f.kind === 'text' && f.link_id === 'name') return 'name';
  return f.kind;
}

function defaultLabel(kind: ReviewFieldKind): string {
  const m: Record<ReviewFieldKind, string> = {
    signature: 'Signature',
    initials: 'Initials',
    name: 'Name',
    date: 'Date',
    text: 'Text',
    email: 'Email',
    checkbox: 'Checkbox',
  };
  return m[kind];
}

/** True when the string looks like a URL that should render as an image
 *  rather than be displayed as text. Covers the three shapes we use:
 *  - `blob:…` — optimistic preview for a just-uploaded signature
 *  - `data:…` — base64-encoded signature preview
 *  - `http(s)://…` — server-provided signed URL */
function looksLikeUrl(s: string): boolean {
  return s.startsWith('blob:') || s.startsWith('data:') || /^https?:\/\//.test(s);
}

function toReviewItem(f: SignMeField): ReviewItem {
  const kind = toUiKind(f);
  const label = f.link_id && f.link_id !== 'name' ? f.link_id : defaultLabel(kind);
  let preview: React.ReactNode = '—';
  if (kind === 'checkbox') {
    preview = f.value_boolean ? '✓ Checked' : '—';
  } else if (kind === 'signature' || kind === 'initials') {
    // value_text for signature/initials fields carries either a blob URL
    // (optimistic preview from uploadSignature.onMutate) or the typed
    // name for a 'typed' signature format. Distinguish by shape so the
    // review card shows a real image preview instead of dumping the
    // blob URL as handwritten text.
    if (typeof f.value_text === 'string' && looksLikeUrl(f.value_text)) {
      preview = (
        <img
          src={f.value_text}
          alt="Signature"
          style={{ height: 32, maxWidth: 180, objectFit: 'contain' }}
        />
      );
    } else if (f.value_text) {
      preview = <SignatureMark name={f.value_text} size={22} />;
    }
  } else if (typeof f.value_text === 'string') {
    preview = f.value_text;
  }
  return { id: f.id, kind, label, page: f.page, valuePreview: preview };
}

function fieldIsFilled(f: SignMeField): boolean {
  if (f.kind === 'checkbox') return f.value_boolean === true;
  return Boolean(f.value_text);
}

/** Item 11 — bridge between SignMeField.kind and FieldInputDrawer.kind. */
function inputKindFor(kind: ReviewFieldKind): FieldInputKind | null {
  if (kind === 'text' || kind === 'email' || kind === 'date' || kind === 'name') return kind;
  return null;
}

function Content() {
  const navigate = useNavigate();
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  const {
    envelope,
    signer,
    fields,
    submit,
    confirmIntentToSign,
    withdrawConsent,
    fillField,
    setSignature,
  } = useSigningSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // T-15 — Submit is gated on an explicit intent-to-sign checkbox so
  // the user's affirmation is a discrete, dateable act distinct from
  // clicking the Submit button.
  const [intentChecked, setIntentChecked] = useState(false);

  // Item 11 — inline-edit state. One slot for the FieldInputDrawer and one
  // for SignatureCapture; both reuse the same components the fill page
  // mounts so values land through the same mutations and audit events.
  const [textEdit, setTextEdit] = useState<{
    readonly field: SignMeField;
    readonly kind: FieldInputKind;
  } | null>(null);
  const [sigEdit, setSigEdit] = useState<{
    readonly field: SignMeField;
    readonly kind: SignatureCaptureKind;
  } | null>(null);

  const handleEdit = useCallback((field: SignMeField, uiKind: ReviewFieldKind) => {
    const inputKind = inputKindFor(uiKind);
    if (inputKind) {
      setTextEdit({ field, kind: inputKind });
      return;
    }
    if (uiKind === 'signature' || uiKind === 'initials') {
      setSigEdit({ field, kind: uiKind });
    }
  }, []);

  const items = useMemo<ReadonlyArray<ReviewItem>>(
    () =>
      fields.filter(fieldIsFilled).map((f) => {
        const base = toReviewItem(f);
        const uiKind = toUiKind(f);
        // Checkboxes aren't editable on the review page — re-toggle is
        // confusing once already affirmed; "Back to fields" remains the
        // path for that edge case.
        if (uiKind === 'checkbox') return base;
        return { ...base, onEdit: () => handleEdit(f, uiKind) };
      }),
    [fields, handleEdit],
  );

  const handleBack = useCallback(
    () => navigate(`/sign/${envelopeId}/fill`),
    [envelopeId, navigate],
  );

  const handleWithdrawConsent = useCallback(async () => {
    if (busy) return;
    // Same warning copy as SigningPrepPage / SigningFillPage so the
    // consequence is identical regardless of which signing-screen step
    // the signer triggers withdrawal from (issue #41).
    // eslint-disable-next-line no-alert -- native confirm is appropriate; a custom modal is over-engineering for an irreversible signer-side terminal action.
    const confirmed = window.confirm(
      'Withdraw consent to sign this document electronically?\n\n' +
        'Seald operates electronically only — withdrawing consent ends this signing request without an alternative. ' +
        'The sender will be notified. This is recorded in the audit trail as a withdrawal (distinct from a decline).',
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await withdrawConsent();
      navigate(`/sign/${envelopeId}/declined`, { replace: true });
    } catch (err) {
      setBusy(false);
      const e = err as ApiErrorLike;
      setError(e.message ?? 'We could not record your withdrawal right now. Please try again.');
    }
  }, [busy, envelopeId, navigate, withdrawConsent]);

  const handleSubmit = useCallback(async () => {
    if (!intentChecked) return;
    setBusy(true);
    setError(null);
    try {
      // Record intent-to-sign first so it lands BEFORE the `signed`
      // event in the chain. The audit PDF reads in chain order; the
      // intent affirmation must precede the signature event for the
      // narrative to be correct.
      await confirmIntentToSign();
      await submit();
      navigate(`/sign/${envelopeId}/done`, { replace: true });
    } catch (err) {
      const e = err as ApiErrorLike;
      if (e.status === 401 || e.status === 410) {
        navigate(`/sign/${envelopeId}`, { replace: true });
        return;
      }
      setError(e.message ?? 'We could not submit right now. Please try again.');
      setBusy(false);
    }
  }, [confirmIntentToSign, envelopeId, intentChecked, navigate, submit]);

  // Item 11 — inline editor handlers. Declared BEFORE the early-return so
  // hook order stays stable across renders. We funnel both kinds of edit
  // through the same mutations the fill page uses (fillField /
  // setSignature) so the audit chain order is identical regardless of
  // where the edit was initiated.
  const closeTextEdit = useCallback(() => setTextEdit(null), []);
  const closeSigEdit = useCallback(() => setSigEdit(null), []);

  const applyTextEdit = useCallback(
    async (value: string) => {
      const fieldId = textEdit?.field.id;
      setTextEdit(null);
      if (!fieldId) return;
      try {
        await fillField(fieldId, { value_text: value });
      } catch (err) {
        const e = err as ApiErrorLike;
        setError(e.message ?? 'We could not update this field. Please try again.');
      }
    },
    [fillField, textEdit?.field.id],
  );

  const applySigEdit = useCallback(
    async (result: SignatureCaptureResult) => {
      const editing = sigEdit;
      setSigEdit(null);
      if (!editing) return;
      try {
        await setSignature(editing.field.id, {
          blob: result.blob,
          format: result.format,
          kind: editing.kind,
          ...(result.font !== undefined ? { font: result.font } : {}),
          ...(result.stroke_count !== undefined ? { stroke_count: result.stroke_count } : {}),
          ...(result.source_filename !== undefined
            ? { source_filename: result.source_filename }
            : {}),
        });
      } catch (err) {
        const e = err as ApiErrorLike;
        setError(e.message ?? 'We could not update this signature. Please try again.');
      }
    },
    [setSignature, sigEdit],
  );

  if (!envelope) return null;

  return (
    <Page>
      <RecipientHeader docTitle={envelope.title} docId={envelope.short_code} stepLabel="Review" />
      <Inner>
        <Heading>Everything look right?</Heading>
        <Helper>
          {/* Item 16 — softer/clearer terminal-action copy. */}
          Once you submit, we&apos;ll seal the document and email a signed copy to everyone.
        </Helper>
        <ReviewList items={items} />

        <Legal>
          <Icon icon={Info} size={14} />
          <span>
            {/* Item 14 — copy acknowledges BOTH the intent-checkbox AND
                the submit click so the dual-affirmation narrative lines
                up with the actual gating UI. */}
            By checking the box below <b>AND</b> clicking <b>Sign and submit</b>, you affirm your
            electronic signature is the legal equivalent of your handwritten signature.
          </span>
        </Legal>

        <IntentRow>
          <IntentCheckbox
            type="checkbox"
            checked={intentChecked}
            onChange={(e) => setIntentChecked(e.target.checked)}
            aria-label="I intend to sign this document with the signature shown above"
          />
          <span>
            <b>I intend to sign this document</b> with the signature shown above. (This affirmation
            is recorded in the audit trail.)
          </span>
        </IntentRow>

        {error ? <ErrorBanner role="alert">{error}</ErrorBanner> : null}

        <Actions>
          <BackBtn type="button" onClick={handleBack} disabled={busy}>
            Back to fields
          </BackBtn>
          <SubmitBtn type="button" onClick={handleSubmit} disabled={busy || !intentChecked}>
            <Icon icon={PenTool} size={16} />
            {busy ? 'Submitting…' : 'Sign and submit'}
          </SubmitBtn>
        </Actions>

        <WithdrawLink type="button" onClick={handleWithdrawConsent} disabled={busy}>
          Withdraw consent to sign electronically
        </WithdrawLink>

        {/* Item 11 — inline editors. Both stay mounted so React Query
            invalidation / focus management is identical to the fill page. */}
        <FieldInputDrawer
          open={textEdit !== null}
          label={textEdit ? (textEdit.field.link_id ?? textEdit.kind) : ''}
          kind={textEdit?.kind ?? 'text'}
          initialValue={
            textEdit && typeof textEdit.field.value_text === 'string'
              ? textEdit.field.value_text
              : ''
          }
          onCancel={closeTextEdit}
          onApply={(v) => {
            applyTextEdit(v).catch(() => {
              /* surfaced via error state */
            });
          }}
        />

        <SignatureCapture
          open={sigEdit !== null}
          kind={sigEdit?.kind ?? 'signature'}
          defaultName={signer?.name ?? ''}
          email={signer?.email ?? ''}
          onCancel={closeSigEdit}
          onApply={(r) => {
            applySigEdit(r).catch(() => {
              /* surfaced via error state */
            });
          }}
        />
      </Inner>
    </Page>
  );
}

/**
 * `/sign/:envelopeId/review` — pre-submit review. Shows every filled field,
 * a legal notice, and a Sign-and-submit button. On success, writes a
 * sessionStorage snapshot (via useSubmitMutation's onSuccess) then
 * navigates to `/done` where the cookie is gone but the snapshot drives the
 * UI.
 */
export function SigningReviewPage() {
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  return (
    <SigningSessionProvider envelopeId={envelopeId} senderName={null}>
      <Content />
    </SigningSessionProvider>
  );
}
