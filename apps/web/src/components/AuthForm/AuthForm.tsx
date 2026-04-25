import { forwardRef, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { Icon } from '../Icon';
import { TextField } from '../TextField';
import { PasswordField } from '../PasswordField';
import { PasswordStrengthMeter } from '../PasswordStrengthMeter';
import { GoogleButton } from '../GoogleButton';
import { Divider } from '../Divider';
import type { AuthFormProps } from './AuthForm.types';
import { scorePassword } from './passwordStrength';
import {
  Checkbox,
  CheckboxRow,
  ErrorBanner,
  Footer,
  Form,
  Heading,
  SkipButton,
  SkipHint,
  SkipRow,
  Submit,
  Subtitle,
  Title,
  TosRow,
} from './AuthForm.styles';

const COPY = {
  signin: { h: 'Welcome back', s: 'Sign in to pick up where you left off.' },
  signup: { h: 'Create your account', s: 'Send your first document in under a minute.' },
  forgot: {
    h: 'Reset your password',
    s: "Enter the email tied to your account and we'll send a secure link.",
  },
} as const;

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/**
 * Mode-driven form used by `/signin`, `/signup`, and `/forgot-password`.
 *
 * Owns local field state and talks to `useAuth()` actions. The parent page
 * decides what happens after submit via callbacks — this keeps the form
 * itself navigation-agnostic (useful for Storybook) while letting pages
 * orchestrate redirects on success.
 */
export const AuthForm = forwardRef<HTMLFormElement, AuthFormProps>((props, ref) => {
  const {
    mode,
    onSkip,
    onForgotPassword,
    onSwitchMode,
    onNeedsEmailConfirmation,
    onForgotSubmitted,
    onAuthed,
    ...rest
  } = props;

  const isSignup = mode === 'signup';
  const isForgot = mode === 'forgot';

  const { signInWithPassword, signUpWithPassword, signInWithGoogle, resetPassword } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => (isSignup ? scorePassword(password) : 0), [isSignup, password]);

  const valid = useMemo(() => {
    if (isForgot) return EMAIL_RE.test(email);
    if (isSignup) {
      return name.trim().length > 1 && EMAIL_RE.test(email) && password.length >= 8 && agreed;
    }
    return EMAIL_RE.test(email) && password.length >= 1;
  }, [isForgot, isSignup, name, email, password, agreed]);

  const handleGoogle = async (): Promise<void> => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
      // No onAuthed — OAuth redirect leaves the app.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start Google sign-in.');
      setBusy(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!valid || busy) return;
    setError(null);
    setBusy(true);
    try {
      if (isForgot) {
        await resetPassword(email);
        onForgotSubmitted?.(email);
        return;
      }
      if (isSignup) {
        const outcome = await signUpWithPassword(name, email, password, keep);
        if (outcome.needsEmailConfirmation) {
          onNeedsEmailConfirmation?.(email);
          return;
        }
        onAuthed?.();
        return;
      }
      await signInWithPassword(email, password, keep);
      onAuthed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  let submitLabel = 'Sign in';
  if (isForgot) submitLabel = 'Send reset link';
  else if (isSignup) submitLabel = 'Create account';

  return (
    <div>
      <Heading>
        <Title>{COPY[mode].h}</Title>
        <Subtitle>{COPY[mode].s}</Subtitle>
      </Heading>

      {!isForgot && (
        <>
          <GoogleButton
            label={isSignup ? 'Sign up with Google' : 'Continue with Google'}
            onClick={handleGoogle}
            busy={busy}
          />
          <Divider label="or" />
        </>
      )}

      <Form ref={ref} {...rest} noValidate onSubmit={handleSubmit}>
        {isSignup && (
          <TextField
            label="Full name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={name}
            onChange={(v) => setName(v)}
          />
        )}
        <TextField
          label={isForgot ? 'Your work email' : 'Email'}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(v) => setEmail(v)}
        />

        {!isForgot && (
          <>
            <PasswordField
              label="Password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
              value={password}
              onChange={(v) => setPassword(v)}
              labelRight={
                !isSignup && onForgotPassword ? (
                  <button
                    type="button"
                    className="link"
                    onClick={onForgotPassword}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    Forgot?
                  </button>
                ) : null
              }
            />
            {isSignup && password.length > 0 ? <PasswordStrengthMeter level={strength} /> : null}
          </>
        )}

        {isSignup && (
          <TosRow>
            <Checkbox
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              aria-label="Agree to Terms of Service and Privacy Policy"
            />
            <span>I agree to Seald&apos;s Terms of Service and Privacy Policy.</span>
          </TosRow>
        )}

        {!isSignup && !isForgot && (
          <CheckboxRow>
            <Checkbox
              type="checkbox"
              checked={keep}
              onChange={(e) => setKeep(e.target.checked)}
              aria-label="Keep me signed in"
            />
            Keep me signed in
          </CheckboxRow>
        )}

        {error ? <ErrorBanner role="alert">{error}</ErrorBanner> : null}

        <Submit type="submit" disabled={!valid || busy}>
          {submitLabel}
        </Submit>
      </Form>

      <Footer>
        {mode === 'signin' && (
          <>
            New to Seald?{' '}
            <button type="button" className="link" onClick={() => onSwitchMode?.('signup')}>
              Create an account
            </button>
          </>
        )}
        {mode === 'signup' && (
          <>
            Already have an account?{' '}
            <button type="button" className="link" onClick={() => onSwitchMode?.('signin')}>
              Sign in
            </button>
          </>
        )}
        {mode === 'forgot' && (
          <>
            Remembered it?{' '}
            <button type="button" className="link" onClick={() => onSwitchMode?.('signin')}>
              Back to sign in
            </button>
          </>
        )}
      </Footer>

      {!isForgot && onSkip ? (
        <SkipRow>
          <SkipButton type="button" onClick={onSkip}>
            Skip — try it without an account
            <Icon icon={ArrowRight} size={14} />
          </SkipButton>
          <SkipHint>You can sign up later to save your documents.</SkipHint>
        </SkipRow>
      ) : null}
    </div>
  );
});
AuthForm.displayName = 'AuthForm';
