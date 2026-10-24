import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { AuthFormColumn, AuthTitle } from '../AuthSplitLayout';
import { Banner } from '../Banner';
import { Button } from '../Button';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { Icon } from '../Icon';
import { TextField } from '../TextField';
import type { WelcomeStepProps } from './WelcomeStep.types';
import { Form, TermsBox, TermsRow, Verified } from './WelcomeStep.styles';

const MIN_NAME = 2;

/**
 * L3 widget: the one extra step for a new account after its first sign-in.
 * Collects the full name and the Terms / Privacy acceptance; "Create
 * account" stays disabled until the name has 2+ characters and the box is
 * ticked. Existing users never see it.
 */
export function WelcomeStep(props: WelcomeStepProps) {
  const { email, initialName = '', onSubmit } = props;
  const [name, setName] = useState(initialName);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agreeId = useId();
  // The board's submit is 44px on desktop and 48px on a phone.
  const mobile = useIsMobileViewport();

  const ready = name.trim().length >= MIN_NAME && agreed;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!ready || busy) return;
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
          aria-label="Full name"
          placeholder="Hannah Wills"
          autoComplete="name"
          value={name}
          disabled={busy}
          onChange={setName}
        />
        <TermsRow>
          <TermsBox
            id={agreeId}
            type="checkbox"
            checked={agreed}
            disabled={busy}
            aria-label="I agree to the Terms and Privacy Policy"
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
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Button
          type="submit"
          size={mobile ? 'lg' : 'md'}
          fullWidth
          iconRight={ArrowRight}
          loading={busy}
          disabled={!ready}
        >
          Create account
        </Button>
      </Form>
    </AuthFormColumn>
  );
}
