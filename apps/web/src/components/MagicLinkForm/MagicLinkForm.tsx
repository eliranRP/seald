import { useState } from 'react';
import type { FormEvent } from 'react';
import { Mail } from 'lucide-react';
import { Banner } from '../Banner';
import { Button } from '../Button';
import { Divider } from '../Divider';
import { GoogleButton } from '../GoogleButton';
import { TextField } from '../TextField';
import { AuthTitle } from '../AuthSplitLayout';
import type { MagicLinkFormProps } from './MagicLinkForm.types';
import { Form, Guest, GuestLink } from './MagicLinkForm.styles';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * L3 widget: the combined "Sign in or create account" form. Google first,
 * then an email field that sends a magic link. One submit covers sign-in and
 * sign-up, so the UI never reveals whether an address already has an account.
 * The email is validated on submit only; the error clears as the user types.
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
  const [invalid, setInvalid] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = email.trim();
    if (sending || locked || trimmed.length === 0) return;
    if (!EMAIL_RE.test(trimmed)) {
      setInvalid(true);
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
      <Divider label="or" />
      <Form noValidate onSubmit={handleSubmit}>
        <TextField
          type="email"
          aria-label="Email"
          placeholder="you@company.com"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          disabled={sending}
          error={invalid ? 'Check the email address' : undefined}
          onChange={(value) => {
            setInvalid(false);
            onEmailChange(value);
          }}
        />
        <Button
          type="submit"
          size="lg"
          fullWidth
          iconLeft={Mail}
          loading={sending}
          disabled={email.trim().length === 0 || locked}
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
