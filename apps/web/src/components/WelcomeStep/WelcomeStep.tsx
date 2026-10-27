import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { AuthFormColumn, AuthTitle } from '../AuthSplitLayout';
import { Banner } from '../Banner';
import { Button } from '../Button';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { Icon } from '../Icon';
import { TextField } from '../TextField';
import type { WelcomeStepProps } from './WelcomeStep.types';
import { Form, TermsBox, TermsError, TermsField, TermsRow, Verified } from './WelcomeStep.styles';

const MIN_NAME = 2;

/**
 * L3 widget: the one extra step for a new account after its first sign-in.
 * Collects the full name and the Terms / Privacy acceptance. "Create
 * account" stays live (forms § 5): a click with a short name or the box not
 * ticked shows an inline message under each blocker and focuses the first; the
 * messages clear live as each one is fixed. Existing users never see it.
 */
export function WelcomeStep(props: WelcomeStepProps) {
  const { email, initialName = '', onSubmit } = props;
  const [name, setName] = useState(initialName);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const agreeRef = useRef<HTMLInputElement>(null);
  const agreeId = useId();
  const agreeErrorId = `${agreeId}-err`;
  // The board's submit is 44px on desktop and 48px on a phone.
  const mobile = useIsMobileViewport();

  const nameOk = name.trim().length >= MIN_NAME;
  const nameError = attempted && !nameOk ? 'Enter your full name' : undefined;
  const termsError = attempted && !agreed ? 'Tick the box to accept the Terms' : undefined;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    if (!nameOk || !agreed) {
      setAttempted(true);
      (nameOk ? agreeRef : nameRef).current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <AuthFormColumn>
      <AuthTitle>Welcome to Seald</AuthTitle>
      <Verified>
        <Icon icon={CheckCircle2} size={14} />
        <span>{email}</span>
      </Verified>
      <Form noValidate onSubmit={(e) => void handleSubmit(e)}>
        <TextField
          ref={nameRef}
          label="Full name"
          autoComplete="name"
          value={name}
          disabled={busy}
          error={nameError}
          onChange={setName}
        />
        <TermsField>
          <TermsRow>
            <TermsBox
              ref={agreeRef}
              id={agreeId}
              type="checkbox"
              checked={agreed}
              disabled={busy}
              aria-label="I agree to the Terms and Privacy Policy"
              aria-invalid={termsError ? true : undefined}
              aria-describedby={termsError ? agreeErrorId : undefined}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              <label htmlFor={agreeId}>I agree to the </label>
              <a href="/legal/terms" target="_blank" rel="noopener noreferrer">
                Terms
              </a>{' '}
              and{' '}
              <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </a>
            </span>
          </TermsRow>
          {termsError ? (
            <TermsError id={agreeErrorId} role="alert">
              {termsError}
            </TermsError>
          ) : null}
        </TermsField>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Button
          type="submit"
          size={mobile ? 'lg' : 'md'}
          fullWidth
          iconRight={ArrowRight}
          loading={busy}
        >
          Create account
        </Button>
      </Form>
    </AuthFormColumn>
  );
}
