import { forwardRef, useCallback, useId, useMemo, useRef, useState } from 'react';
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
  LabelLink,
  SkipButton,
  SkipHint,
  SkipRow,
  Submit,
  Subtitle,
  Title,
  TosLabel,
  TosRow,
  TosText,
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
  // Combined ESIGN/GDPR attestation (audit C: SignUp #10). One checkbox
  // attests BOTH that the user is of legal age (T-24) AND that they
  // agree to Seald's Terms + Privacy Policy. ESIGN-valid for a single
  // affirmative consent covering multiple disclosures.
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Field-level errors surfaced by submit when `disabled` was lifted —
  // the user clicks the button to find out what's missing instead of
  // staring at a half-grey CTA (audit C: SignUp #3).
  const [fieldErrors, setFieldErrors] = useState<{
    readonly name?: string;
    readonly email?: string;
    readonly password?: string;
    readonly agreed?: string;
  }>({});

  const nameRef = useRef<HTMLInputElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const agreedRef = useRef<HTMLInputElement | null>(null);

  const agreedId = useId();

  const strength = useMemo(() => (isSignup ? scorePassword(password) : 0), [isSignup, password]);

  // The combined attestation gates the password Submit. It ALSO gates
  // Google + Skip in signup mode — both create an account on our side
  // (Google = OAuth-claimed user, Skip = guest session bound to our
  // Privacy Policy) so the affirmative ESIGN/GDPR consent must happen
  // before either flow starts. Signin mode shows no checkbox and is
  // unaffected.
  const signupConsented = agreed;

  const valid = useMemo(() => {
    if (isForgot) return EMAIL_RE.test(email);
    if (isSignup) {
      return (
        name.trim().length >= 2 && EMAIL_RE.test(email) && password.length >= 8 && signupConsented
      );
    }
    return EMAIL_RE.test(email) && password.length >= 1;
  }, [isForgot, isSignup, name, email, password, signupConsented]);

  const handleGoogle = async (): Promise<void> => {
    if (busy) return;
    if (isSignup && !signupConsented) return;
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

  const handleSkip = (): void => {
    if (isSignup && !signupConsented) return;
    onSkip?.();
  };

  // Validate every signup field eagerly on submit and mark each failure
  // with an inline error (audit C: SignUp #3). The first failing field is
  // focused so keyboard + screen-reader users land on what to fix instead
  // of guessing why the disabled CTA didn't fire.
  const collectSignupErrors = useCallback((): {
    readonly errors: {
      readonly name?: string;
      readonly email?: string;
      readonly password?: string;
      readonly agreed?: string;
    };
    readonly firstFailing: 'name' | 'email' | 'password' | 'agreed' | null;
  } => {
    const errors: {
      name?: string;
      email?: string;
      password?: string;
      agreed?: string;
    } = {};
    let firstFailing: 'name' | 'email' | 'password' | 'agreed' | null = null;
    if (name.trim().length < 2) {
      errors.name = 'Please enter your name (2 characters or more).';
      firstFailing ??= 'name';
    }
    if (!EMAIL_RE.test(email)) {
      errors.email = 'Enter a valid email address.';
      firstFailing ??= 'email';
    }
    if (password.length < 8) {
      errors.password = 'Use at least 8 characters.';
      firstFailing ??= 'password';
    }
    if (!signupConsented) {
      errors.agreed = 'Please confirm age and accept the Terms + Privacy Policy.';
      firstFailing ??= 'agreed';
    }
    return { errors, firstFailing };
  }, [name, email, password, signupConsented]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (busy) return;

    if (isSignup && !valid) {
      const { errors, firstFailing } = collectSignupErrors();
      setFieldErrors(errors);
      if (firstFailing === 'name') nameRef.current?.focus();
      else if (firstFailing === 'email') emailRef.current?.focus();
      else if (firstFailing === 'password') passwordRef.current?.focus();
      else if (firstFailing === 'agreed') agreedRef.current?.focus();
      return;
    }
    if (!valid) return;

    setFieldErrors({});
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
            disabled={isSignup && !signupConsented}
          />
          <Divider label="or" />
        </>
      )}

      <Form ref={ref} {...rest} noValidate onSubmit={handleSubmit}>
        {isSignup && (
          <TextField
            ref={nameRef}
            label="Full name"
            autoComplete="name"
            placeholder="Ada Lovelace"
            value={name}
            onChange={(v) => setName(v)}
            error={fieldErrors.name}
          />
        )}
        <TextField
          ref={emailRef}
          label={isForgot ? 'Email address' : 'Email'}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(v) => setEmail(v)}
          error={fieldErrors.email}
        />

        {!isForgot && (
          <>
            <PasswordField
              ref={passwordRef}
              label="Password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'}
              value={password}
              onChange={(v) => setPassword(v)}
              error={fieldErrors.password}
              labelRight={
                !isSignup && onForgotPassword ? (
                  <LabelLink type="button" onClick={onForgotPassword}>
                    Forgot?
                  </LabelLink>
                ) : null
              }
            />
            {isSignup && password.length > 0 ? (
              <div role="status" aria-live="polite" aria-atomic="true">
                <PasswordStrengthMeter level={strength} />
              </div>
            ) : null}
          </>
        )}

        {isSignup && (
          <>
            <TosRow>
              {/* The anchors live OUTSIDE the <label> (audit C: SignUp #2 —
                  option A) so a click on Terms/Privacy never re-fires a
                  click on the labeled checkbox via label activation. The
                  prefix attestation text remains inside a <label htmlFor>
                  so clicking the words still toggles consent. */}
              <Checkbox
                ref={agreedRef}
                id={agreedId}
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                aria-label="Confirm I am of legal age and agree to Seald's Terms of Service and Privacy Policy"
                aria-invalid={fieldErrors.agreed ? true : undefined}
              />
              <TosText>
                <TosLabel htmlFor={agreedId}>
                  I confirm I&apos;m of legal age and agree to Seald&apos;s{' '}
                </TosLabel>
                <a href="/legal/terms" target="_blank" rel="noopener noreferrer">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="/legal/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </a>
                .
              </TosText>
            </TosRow>
            {fieldErrors.agreed ? (
              <ErrorBanner role="alert">{fieldErrors.agreed}</ErrorBanner>
            ) : null}
          </>
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

        {/* Disabled only while busy. When fields are invalid we let the
            user click and surface inline errors per field — disabled CTAs
            with no explanation are a worse UX than an enabled CTA that
            tells you what's wrong (audit C: SignUp #3). */}
        <Submit type="submit" disabled={busy}>
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
          <SkipButton type="button" onClick={handleSkip} disabled={isSignup && !signupConsented}>
            Skip — try it without an account
            <Icon icon={ArrowRight} size={14} />
          </SkipButton>
          <SkipHint>
            Documents you create as a guest stay on this device. Sign up to access them anywhere.
          </SkipHint>
        </SkipRow>
      ) : null}
    </div>
  );
});
AuthForm.displayName = 'AuthForm';
