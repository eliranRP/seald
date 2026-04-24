import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { Info, PenTool } from 'lucide-react';
import { Icon } from '../../components/Icon';
import { RecipientHeader } from '../../components/RecipientHeader';
import { ReviewList } from '../../components/ReviewList';
import type { ReviewItem, ReviewFieldKind } from '../../components/ReviewList';
import { SignatureMark } from '../../components/SignatureMark';
import { SigningSessionProvider, useSigningSession } from '../../features/signing';
import type { SignMeField } from '../../features/signing';

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
  const { envelope, fields, submit } = useSigningSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => fields.filter(fieldIsFilled).map(toReviewItem), [fields]);

  const handleBack = useCallback(
    () => navigate(`/sign/${envelopeId}/fill`),
    [envelopeId, navigate],
  );

  const handleSubmit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
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
  }, [envelopeId, navigate, submit]);

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

        <Legal>
          <Icon icon={Info} size={14} />
          <span>
            By clicking <b>Sign and submit</b>, you agree your electronic signature is the legal
            equivalent of your handwritten signature.
          </span>
        </Legal>

        {error ? <ErrorBanner role="alert">{error}</ErrorBanner> : null}

        <Actions>
          <BackBtn type="button" onClick={handleBack} disabled={busy}>
            Back to fields
          </BackBtn>
          <SubmitBtn type="button" onClick={handleSubmit} disabled={busy}>
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
