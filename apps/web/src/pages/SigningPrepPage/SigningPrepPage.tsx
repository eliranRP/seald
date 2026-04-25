import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { RecipientHeader } from '@/components/RecipientHeader';
import { SigningSessionProvider, useSigningSession } from '@/features/signing';
import {
  Checkbox,
  Chip,
  DeclineLink,
  ErrorBanner,
  Hero,
  IdCard,
  IdEmail,
  IdName,
  IdRow,
  Inner,
  NotMe,
  Page,
  PrimaryBtn,
  SigningAsLabel,
  Subhero,
  TosRow,
} from './SigningPrepPage.styles';

interface ApiErrorLike extends Error {
  status?: number;
}

function Content() {
  const navigate = useNavigate();
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  const { envelope, signer, acceptTerms, decline } = useSigningSession();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    if (!agreed || !envelope || !signer) return;
    setBusy(true);
    setError(null);
    try {
      if (!signer.tc_accepted_at) {
        await acceptTerms();
      }
      navigate(`/sign/${envelopeId}/fill`);
    } catch (err) {
      const e = err as ApiErrorLike;
      if (e.status === 401 || e.status === 410) {
        navigate(`/sign/${envelopeId}`, { replace: true });
        return;
      }
      setError(e.message ?? 'We could not record your acceptance. Please try again.');
      setBusy(false);
    }
  }, [acceptTerms, agreed, envelope, envelopeId, navigate, signer]);

  const handleDecline = useCallback(async () => {
    if (busy) return;
    // eslint-disable-next-line no-alert -- native confirm is appropriate here; a custom dialog is over-engineering for a destructive signer action.
    const confirmed = window.confirm(
      'Decline this signing request? The sender will be notified and the document will remain unsigned.',
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await decline('declined-on-prep');
      navigate(`/sign/${envelopeId}/declined`, { replace: true });
    } catch (err) {
      setBusy(false);
      const e = err as ApiErrorLike;
      setError(e.message ?? 'We could not decline right now. Please try again.');
    }
  }, [busy, decline, envelopeId, navigate]);

  const handleNotMe = useCallback(() => {
    // Treat "Not me" as a decline with a specific reason. Simpler than a
    // dedicated endpoint and surfaces the same audit event on the backend.
    if (busy) return;
    (async () => {
      setBusy(true);
      try {
        await decline('not-the-recipient');
        navigate(`/sign/${envelopeId}/declined`, { replace: true });
      } catch {
        setBusy(false);
      }
    })();
  }, [busy, decline, envelopeId, navigate]);

  if (!envelope || !signer) return null;

  return (
    <Page>
      <RecipientHeader docTitle={envelope.title} docId={envelope.short_code} stepLabel="Identity" />
      <Inner>
        <Chip>
          <Icon icon={Mail} size={12} />
          Signature request
        </Chip>
        <Hero>
          You&apos;ve been asked to sign <em>{envelope.title}</em>.
        </Hero>
        <Subhero>
          Confirm your details below and we&apos;ll walk you through each field. No Sealed account
          required.
        </Subhero>

        <IdCard>
          <SigningAsLabel>Signing as</SigningAsLabel>
          <IdRow>
            <Avatar name={signer.name} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <IdName>{signer.name}</IdName>
              <IdEmail>{signer.email}</IdEmail>
            </div>
            <NotMe type="button" onClick={handleNotMe} disabled={busy}>
              Not me?
            </NotMe>
          </IdRow>

          <TosRow>
            <Checkbox
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              aria-label="Agree to electronic signatures"
            />
            <span>
              I agree to use electronic signatures and to be bound by Sealed&apos;s Consumer
              Disclosure.
            </span>
          </TosRow>
        </IdCard>

        {error ? <ErrorBanner role="alert">{error}</ErrorBanner> : null}

        <PrimaryBtn type="button" disabled={!agreed || busy} onClick={handleStart}>
          {busy ? 'One moment…' : 'Start signing'}
          {!busy ? <Icon icon={ArrowRight} size={16} /> : null}
        </PrimaryBtn>

        <DeclineLink type="button" onClick={handleDecline} disabled={busy}>
          Decline this request
        </DeclineLink>
      </Inner>
    </Page>
  );
}

/**
 * `/sign/:envelopeId/prep` — recipient confirms identity and acknowledges
 * the Consumer Disclosure checkbox before proceeding to field filling.
 */
export function SigningPrepPage() {
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  return (
    <SigningSessionProvider envelopeId={envelopeId} senderName={null}>
      <Content />
    </SigningSessionProvider>
  );
}
