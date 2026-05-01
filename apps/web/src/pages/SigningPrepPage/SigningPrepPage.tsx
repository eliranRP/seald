import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { RecipientHeader } from '@/components/RecipientHeader';
import { SigningSessionProvider, useSigningSession } from '@/features/signing';
import { ESIGN_DISCLOSURE_VERSION } from 'shared';
import {
  AesDisclosure,
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
  WithdrawLink,
} from './SigningPrepPage.styles';

interface ApiErrorLike extends Error {
  status?: number;
}

function Content() {
  const navigate = useNavigate();
  const params = useParams<{ readonly envelopeId: string }>();
  const envelopeId = params.envelopeId ?? '';
  const { envelope, signer, acceptTerms, acknowledgeEsignDisclosure, decline, withdrawConsent } =
    useSigningSession();
  // T-14: split the single ToS checkbox into two — agreement + the ESIGN
  // §7001(c)(1)(C)(ii) "demonstrated ability" affirmation. Both must be
  // checked before "Start signing" enables.
  const [agreed, setAgreed] = useState(false);
  const [canAccess, setCanAccess] = useState(false);
  const ready = agreed && canAccess;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    if (!ready || !envelope || !signer) return;
    setBusy(true);
    setError(null);
    try {
      if (!signer.tc_accepted_at) {
        await acceptTerms();
      }
      // ESIGN disclosure ack is recorded as a discrete audit event each
      // time the signer reaches the prep step from a fresh session. The
      // backend doesn't dedupe — re-sending is harmless because it
      // appends to the chain idempotently.
      await acknowledgeEsignDisclosure(ESIGN_DISCLOSURE_VERSION);
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
  }, [acceptTerms, acknowledgeEsignDisclosure, ready, envelope, envelopeId, navigate, signer]);

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

  const handleWithdrawConsent = useCallback(async () => {
    if (busy) return;
    // Distinct from "Decline" — withdrawal of consent under ESIGN
    // §7001(c)(1). We make the consequence explicit in the confirm
    // dialog so users don't conflate it with decline.
    // eslint-disable-next-line no-alert -- native confirm is appropriate; a custom modal is over-engineering for an irreversible signer-side terminal action.
    const confirmed = window.confirm(
      'Withdraw consent to sign this document electronically?\n\n' +
        'Seald operates electronically only — withdrawing consent ends this signing request without an alternative. ' +
        'The sender will be notified. This is recorded in the audit trail as a withdrawal (distinct from a decline).',
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await withdrawConsent();
      navigate(`/sign/${envelopeId}/declined`, { replace: true });
    } catch (err) {
      setBusy(false);
      const e = err as ApiErrorLike;
      setError(e.message ?? 'We could not record your withdrawal right now. Please try again.');
    }
  }, [busy, envelopeId, navigate, withdrawConsent]);

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
          Confirm your details below and we&apos;ll walk you through each field. No Seald account
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
              aria-label="I have read the Consumer Disclosure"
            />
            <span>
              I have read Seald&apos;s{' '}
              <a href="/legal/esign-disclosure" target="_blank" rel="noopener noreferrer">
                ESIGN Consumer Disclosure
              </a>{' '}
              and consent to use electronic signatures and electronic records for this document.
            </span>
          </TosRow>

          <TosRow>
            <Checkbox
              type="checkbox"
              checked={canAccess}
              onChange={(e) => setCanAccess(e.target.checked)}
              aria-label="I can access electronic records on this device"
            />
            <span>
              I can access and retain electronic records on this device — for example, by viewing
              this page and downloading a PDF (as required by ESIGN&nbsp;§&nbsp;101(c)(1)(C)(ii)).
            </span>
          </TosRow>
        </IdCard>

        <AesDisclosure>
          Seald produces an Advanced Electronic Signature (PAdES-LT) — legally equivalent to a
          handwritten signature in most jurisdictions. Some documents (wills, real-estate
          conveyances, certain DE/FR/IT/ES instruments) require a Qualified Electronic Signature or
          wet ink. Consult counsel if unsure.
        </AesDisclosure>

        {error ? <ErrorBanner role="alert">{error}</ErrorBanner> : null}

        <PrimaryBtn type="button" disabled={!ready || busy} onClick={handleStart}>
          {busy ? 'One moment…' : 'Start signing'}
          {!busy ? <Icon icon={ArrowRight} size={16} /> : null}
        </PrimaryBtn>

        <DeclineLink type="button" onClick={handleDecline} disabled={busy}>
          Decline this request
        </DeclineLink>
        <WithdrawLink type="button" onClick={handleWithdrawConsent} disabled={busy}>
          Withdraw consent to sign electronically
        </WithdrawLink>
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
