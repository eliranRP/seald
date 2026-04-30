import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { BookmarkPlus, Info, PenTool } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { RecipientHeader } from '@/components/RecipientHeader';
import { ReviewList } from '@/components/ReviewList';
import type { ReviewItem, ReviewFieldKind } from '@/components/ReviewList';
import { SaveAsTemplateDialog } from '@/components/SaveAsTemplateDialog';
import type { SaveAsTemplatePayload } from '@/components/SaveAsTemplateDialog';
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
  font-size: 36px;
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

const SaveTemplateRow = styled.div`
  margin-top: ${({ theme }) => theme.space[5]};
  display: flex;
  justify-content: flex-end;
`;

const SaveTemplateBtn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: 8px 14px;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  &:hover,
  &:focus-visible {
    border-color: ${({ theme }) => theme.color.indigo[500]};
    color: ${({ theme }) => theme.color.indigo[700]};
  }
`;

const Toast = styled.div`
  margin-top: ${({ theme }) => theme.space[4]};
  background: ${({ theme }) => theme.color.success[50]};
  border: 1px solid ${({ theme }) => theme.color.success[500]};
  color: ${({ theme }) => theme.color.success[700]};
  font-size: ${({ theme }) => theme.font.size.caption};
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radius.sm};
`;

const ErrorBanner = styled.div`
  margin-top: ${({ theme }) => theme.space[4]};
  background: ${({ theme }) => theme.color.danger[50]};
  border: 1px solid ${({ theme }) => theme.color.danger[500]};
  color: ${({ theme }) => theme.color.danger[700]};
  font-size: ${({ theme }) => theme.font.size.caption};
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radius.sm};
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

function Content() {
  const navigate = useNavigate();
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  const { envelope, fields, submit, confirmIntentToSign } = useSigningSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [savedTplToast, setSavedTplToast] = useState<string | null>(null);
  // T-15 — Submit is gated on an explicit intent-to-sign checkbox so
  // the user's affirmation is a discrete, dateable act distinct from
  // clicking the Submit button.
  const [intentChecked, setIntentChecked] = useState(false);

  const items = useMemo(() => fields.filter(fieldIsFilled).map(toReviewItem), [fields]);

  const handleSaveTemplate = useCallback(
    (payload: SaveAsTemplatePayload): void => {
      // TODO(api): replace this client-only stub with a POST to the
      // templates service once it lands. The payload mirrors what the
      // sender-side `/templates` flow expects so the call site won't move.
      // eslint-disable-next-line no-console
      console.log('[save-as-template]', { ...payload, envelopeId, fieldCount: items.length });
      setSaveTplOpen(false);
      setSavedTplToast(`Saved "${payload.title}" as a template.`);
    },
    [envelopeId, items.length],
  );

  const handleBack = useCallback(
    () => navigate(`/sign/${envelopeId}/fill`),
    [envelopeId, navigate],
  );

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

  if (!envelope) return null;

  return (
    <Page>
      <RecipientHeader docTitle={envelope.title} docId={envelope.short_code} stepLabel="Review" />
      <Inner>
        <Heading>Everything look right?</Heading>
        <Helper>
          Once you submit, we&apos;ll lock the document and send a signed copy to everyone.
        </Helper>
        <ReviewList items={items} />

        <SaveTemplateRow>
          <SaveTemplateBtn type="button" onClick={() => setSaveTplOpen(true)}>
            <Icon icon={BookmarkPlus} size={14} />
            Save as template
          </SaveTemplateBtn>
        </SaveTemplateRow>

        {savedTplToast ? <Toast role="status">{savedTplToast}</Toast> : null}

        <SaveAsTemplateDialog
          open={saveTplOpen}
          defaultTitle={envelope.title}
          onCancel={() => setSaveTplOpen(false)}
          onSave={handleSaveTemplate}
        />

        <Legal>
          <Icon icon={Info} size={14} />
          <span>
            By clicking <b>Sign and submit</b>, you agree your electronic signature is the legal
            equivalent of your handwritten signature.
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
