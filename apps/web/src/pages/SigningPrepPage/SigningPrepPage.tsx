import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trans } from 'react-i18next';
import { ArrowRight, Mail } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import {
  DialogBackdrop,
  DialogCard,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/DialogPrimitives';
import { Icon } from '@/components/Icon';
import { RecipientHeader } from '@/components/RecipientHeader';
import { SigningSessionProvider, useSigningSession } from '@/features/signing';
import { ESIGN_DISCLOSURE_VERSION, RECORD_ACCESS_ATTESTATION } from 'shared';
import { SignatureLevelNote } from '@/components/SignatureLevelNote';
import { useT } from '@/lib/i18n';
import {
  AccountNote,
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
  OptOutBody,
  OptOutDetails,
  OptOutSummary,
  Page,
  PrimaryBtn,
  SigningAsLabel,
  Subhero,
  TosRow,
  WithdrawDialogCancel,
  WithdrawDialogConfirm,
  WithdrawDialogEventName,
  WithdrawLink,
} from './SigningPrepPage.styles';

interface ApiErrorLike extends Error {
  status?: number;
}

function Content() {
  const t = useT();
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
  // Item 7 — withdraw consent now opens a styled `<DialogCard>` instead of
  // window.confirm. The dialog visibility is a discrete state so we can
  // surface the audit-event name (`consent_withdrawn`) inside the body.
  const [withdrawOpen, setWithdrawOpen] = useState(false);

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
      const apiError = err as ApiErrorLike;
      if (apiError.status === 401 || apiError.status === 410) {
        navigate(`/sign/${envelopeId}`, { replace: true });
        return;
      }
      setError(apiError.message ?? t('signing.prep.errorAccept'));
      setBusy(false);
    }
  }, [acceptTerms, acknowledgeEsignDisclosure, ready, envelope, envelopeId, navigate, signer, t]);

  const handleDecline = useCallback(async () => {
    if (busy) return;
    // native confirm is appropriate here; a custom dialog is over-engineering for a destructive signer action.
    const confirmed = window.confirm(t('signing.prep.declineConfirm'));
    if (!confirmed) return;
    setBusy(true);
    try {
      await decline('declined-on-prep');
      navigate(`/sign/${envelopeId}/declined`, { replace: true });
    } catch (err) {
      setBusy(false);
      const apiError = err as ApiErrorLike;
      setError(apiError.message ?? t('signing.prep.errorDecline'));
    }
  }, [busy, decline, envelopeId, navigate, t]);

  const openWithdrawDialog = useCallback(() => {
    if (busy) return;
    setWithdrawOpen(true);
  }, [busy]);

  const closeWithdrawDialog = useCallback(() => {
    setWithdrawOpen(false);
  }, []);

  const handleWithdrawConfirmed = useCallback(async () => {
    // Item 7 — invoked from the styled confirm button. Audit-event copy
    // (`consent_withdrawn`) is surfaced in the dialog body so the user
    // sees exactly what the audit trail will record.
    setWithdrawOpen(false);
    if (busy) return;
    setBusy(true);
    try {
      await withdrawConsent();
      navigate(`/sign/${envelopeId}/declined`, { replace: true });
    } catch (err) {
      setBusy(false);
      const apiError = err as ApiErrorLike;
      setError(apiError.message ?? t('signing.prep.errorWithdraw'));
    }
  }, [busy, envelopeId, navigate, withdrawConsent, t]);

  const handleNotMe = useCallback(() => {
    // Treat "Not me" as a decline with a specific reason. Simpler than a
    // dedicated endpoint and surfaces the same audit event on the backend.
    //
    // BUG FIX: previously fired immediately on click — a small target near
    // the user's avatar made accidental decline trivial on mobile. Confirm
    // the destructive action just like `handleDecline` does. The audit
    // event is irreversible (and emails the sender), so the one-tap UX
    // failure mode was real.
    if (busy) return;
    // native confirm is appropriate; mirrors handleDecline above.
    const confirmed = window.confirm(
      `${t('signing.prep.notMeTitle')}\n\n${t('signing.prep.notMeBody')}`,
    );
    if (!confirmed) return;
    (async () => {
      setBusy(true);
      try {
        await decline('not-the-recipient');
        navigate(`/sign/${envelopeId}/declined`, { replace: true });
      } catch {
        setBusy(false);
      }
    })();
  }, [busy, decline, envelopeId, navigate, t]);

  if (!envelope || !signer) return null;

  return (
    <Page>
      <RecipientHeader
        docTitle={envelope.title}
        docId={envelope.short_code}
        stepLabel={t('signing.stepLabels.identity')}
      />
      <Inner>
        <Chip>
          <Icon icon={Mail} size={12} />
          {t('signing.prep.chip')}
        </Chip>
        <Hero>
          <Trans
            i18nKey="signing.prep.hero"
            values={{ title: envelope.title }}
            components={{ em: <em /> }}
          />
        </Hero>
        <Subhero>{t('signing.prep.subhero')}</Subhero>

        <IdCard>
          <SigningAsLabel>{t('signing.prep.signingAs')}</SigningAsLabel>
          <IdRow>
            <Avatar name={signer.name} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <IdName>{signer.name}</IdName>
              <IdEmail>{signer.email}</IdEmail>
            </div>
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
              aria-label={RECORD_ACCESS_ATTESTATION}
            />
            <span>{RECORD_ACCESS_ATTESTATION}</span>
          </TosRow>
        </IdCard>

        <SignatureLevelNote />
        {/* Item 10 — demoted from <Subhero> so the legal screen above stays
            the focal point. Visible but not promoted as marketing copy. */}
        <AccountNote>{t('signing.prep.noAccount')}</AccountNote>

        {/* Item 5 — single subdued opt-out group below SignatureLevelNote.
            We tag the <summary> with role="button" explicitly because
            JSDom's accessibility tree does not currently implement the
            implicit summary→button mapping that browsers ship; the
            attribute is a no-op in real browsers (native role wins). */}
        <OptOutDetails>
          <OptOutSummary role="button">{t('signing.prep.optOutSummary')}</OptOutSummary>
          <OptOutBody>
            <DeclineLink type="button" onClick={handleNotMe} disabled={busy}>
              {t('signing.prep.wrongRecipient')}
            </DeclineLink>
            <DeclineLink type="button" onClick={handleDecline} disabled={busy}>
              {t('signing.prep.declineRequest')}
            </DeclineLink>
            <WithdrawLink type="button" onClick={openWithdrawDialog} disabled={busy}>
              Withdraw consent to sign electronically
            </WithdrawLink>
          </OptOutBody>
        </OptOutDetails>

        {error ? <ErrorBanner role="alert">{error}</ErrorBanner> : null}

        <PrimaryBtn type="button" disabled={!ready || busy} onClick={handleStart}>
          {busy ? t('signing.prep.busy') : t('signing.prep.startSigning')}
          {!busy ? <Icon icon={ArrowRight} size={16} /> : null}
        </PrimaryBtn>

        {/* Item 7 — styled withdraw-consent dialog (replaces window.confirm). */}
        {withdrawOpen ? (
          <DialogBackdrop onClick={closeWithdrawDialog}>
            <DialogCard
              role="dialog"
              aria-modal="true"
              aria-label="Withdraw consent"
              onClick={(e) => e.stopPropagation()}
            >
              <DialogTitle>Withdraw consent to sign electronically?</DialogTitle>
              <DialogDescription>
                Seald operates electronically only — withdrawing consent ends this signing request
                without an alternative. The sender will be notified. This is recorded in the audit
                trail as <WithdrawDialogEventName>consent_withdrawn</WithdrawDialogEventName>{' '}
                (distinct from a decline).
              </DialogDescription>
              <DialogFooter>
                <WithdrawDialogCancel type="button" onClick={closeWithdrawDialog}>
                  Keep signing
                </WithdrawDialogCancel>
                <WithdrawDialogConfirm
                  type="button"
                  onClick={handleWithdrawConfirmed}
                  disabled={busy}
                >
                  Withdraw consent
                </WithdrawDialogConfirm>
              </DialogFooter>
            </DialogCard>
          </DialogBackdrop>
        ) : null}
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
