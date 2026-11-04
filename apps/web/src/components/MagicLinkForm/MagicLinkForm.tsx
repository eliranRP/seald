import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Mail } from 'lucide-react';
import { Banner } from '../Banner';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { Button } from '../Button';
import { GoogleButton } from '../GoogleButton';
import { TextField } from '../TextField';
import { AuthTitle } from '../AuthSplitLayout';
import type { MagicLinkFormProps } from './MagicLinkForm.types';
import { Form, Guest, GuestLink, OrRow } from './MagicLinkForm.styles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * L3 widget: the combined "Sign in or create account" form. Google first,
 * then an email field that sends a magic link. One submit covers sign-in and
 * sign-up, so the UI never reveals whether an address already has an account.
 * The email is validated on submit only; the error clears as the user types.
 * The submit stays live while the field is empty: a click names what is
 * missing and moves focus to the field (forms § 5) instead of a silent,
 * low-contrast disabled button.
 */
export function MagicLinkForm(props: MagicLinkFormProps) {
  const {
    email,
    onEmailChange,
    onSubmit,
    onGoogle,
    onGuest,
    sending = false,
    googleBusy = false,
    locked = false,
    notice,
    submitLabel = 'Email me a sign-in link',
  } = props;
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  // The board's submit is 44px on desktop and 48px on a phone.
  const mobile = useIsMobileViewport();

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = email.trim();
    if (sending || locked) return;
    if (trimmed.length === 0) {
      setFieldError('Enter your email address');
      inputRef.current?.focus();
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setFieldError('Check the email address');
      inputRef.current?.focus();
      return;
    }
    onSubmit(trimmed);
  };

  return (
    <>
      {notice ? (
        <Banner tone={notice.tone} icon={notice.icon}>
          {notice.text}
        </Banner>
      ) : null}
      <AuthTitle>Sign in or create account</AuthTitle>
      <GoogleButton
        label="Continue with Google"
        onClick={onGoogle}
        busy={googleBusy}
        disabled={sending}
      />
      <OrRow role="separator" aria-label="or">
        or
      </OrRow>
      <Form noValidate onSubmit={handleSubmit}>
        <TextField
          ref={inputRef}
          type="email"
          label="Email"
          placeholder="you@company.com"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          disabled={sending}
          error={fieldError}
          onChange={(value) => {
            setFieldError(undefined);
            onEmailChange(value);
          }}
        />
        <Button
          type="submit"
          size={mobile ? 'lg' : 'md'}
          fullWidth
          iconLeft={Mail}
          loading={sending}
          disabled={locked}
        >
          {sending ? 'Sending…' : submitLabel}
        </Button>
      </Form>
      {onGuest ? (
        <Guest>
          <GuestLink type="button" onClick={onGuest}>
            Try without an account
          </GuestLink>
        </Guest>
      ) : null}
    </>
  );
}
