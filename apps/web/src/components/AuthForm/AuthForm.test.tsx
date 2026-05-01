import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import type { ReactNode } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { AuthForm } from './AuthForm';
import type { AuthContextValue } from '../../providers/AuthProvider';

// The AuthForm reaches into `useAuth()` — in a unit test we stub the module so
// we can assert on what the form calls without standing up Supabase.
const auth = {
  session: null,
  user: null,
  guest: false,
  loading: false,
  signInWithPassword: vi.fn(async () => undefined),
  signUpWithPassword: vi.fn(async () => ({ needsEmailConfirmation: false })),
  signInWithGoogle: vi.fn(async () => undefined),
  resetPassword: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
  enterGuestMode: vi.fn(),
  exitGuestMode: vi.fn(),
} satisfies AuthContextValue;

vi.mock('../../providers/AuthProvider', () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }: { readonly children: ReactNode }) => children,
}));

describe('AuthForm', () => {
  beforeEach(() => {
    auth.signInWithPassword.mockClear();
    auth.signUpWithPassword.mockClear();
    auth.signInWithGoogle.mockClear();
    auth.resetPassword.mockClear();
  });

  it('disables submit until valid in signin mode', async () => {
    const { getByRole, getByLabelText } = renderWithTheme(<AuthForm mode="signin" />);
    const submit = getByRole('button', { name: /sign in/i });
    expect(submit).toBeDisabled();

    await userEvent.type(getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(getByLabelText(/^password$/i), 'hunter2');
    expect(submit).not.toBeDisabled();
  });

  it('calls signInWithPassword on submit with keep-signed-in', async () => {
    const onAuthed = vi.fn();
    const { getByRole, getByLabelText } = renderWithTheme(
      <AuthForm mode="signin" onAuthed={onAuthed} />,
    );
    await userEvent.type(getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(getByLabelText(/^password$/i), 'hunter2');
    await userEvent.click(getByRole('button', { name: /sign in/i }));
    expect(auth.signInWithPassword).toHaveBeenCalledWith('ada@example.com', 'hunter2', true);
    expect(onAuthed).toHaveBeenCalledTimes(1);
  });

  it('toggles Keep me signed in off before submit', async () => {
    const { getByRole, getByLabelText } = renderWithTheme(<AuthForm mode="signin" />);
    await userEvent.type(getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(getByLabelText(/^password$/i), 'hunter2');
    await userEvent.click(getByLabelText(/keep me signed in/i));
    await userEvent.click(getByRole('button', { name: /sign in/i }));
    expect(auth.signInWithPassword).toHaveBeenCalledWith('ada@example.com', 'hunter2', false);
  });

  it('gates signup submit on ToS + age-gate checkboxes', async () => {
    const { getByRole, getByLabelText } = renderWithTheme(<AuthForm mode="signup" />);
    const submit = getByRole('button', { name: /create account/i });
    await userEvent.type(getByLabelText(/full name/i), 'Ada Lovelace');
    await userEvent.type(getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(getByLabelText(/^password$/i), 'hunter2!!');
    expect(submit).toBeDisabled();
    // ToS alone isn't enough — age gate must also be ticked.
    await userEvent.click(getByLabelText(/agree to terms/i));
    expect(submit).toBeDisabled();
    await userEvent.click(getByLabelText(/legal age/i));
    expect(submit).not.toBeDisabled();
  });

  it('keeps signup submit disabled when age gate is unchecked even if ToS is checked', async () => {
    const { getByRole, getByLabelText } = renderWithTheme(<AuthForm mode="signup" />);
    const submit = getByRole('button', { name: /create account/i });
    await userEvent.type(getByLabelText(/full name/i), 'Ada Lovelace');
    await userEvent.type(getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(getByLabelText(/^password$/i), 'hunter2!!');
    await userEvent.click(getByLabelText(/agree to terms/i));
    expect(submit).toBeDisabled();
  });

  it('links the ToS row to the Terms of Service and Privacy Policy pages', () => {
    const { getByRole } = renderWithTheme(<AuthForm mode="signup" />);
    expect(getByRole('link', { name: /terms of service/i })).toHaveAttribute(
      'href',
      '/legal/terms',
    );
    expect(getByRole('link', { name: /privacy policy/i })).toHaveAttribute(
      'href',
      '/legal/privacy',
    );
  });

  it('shows the strength meter once the user starts typing a password in signup', async () => {
    const { getByLabelText, queryByRole } = renderWithTheme(<AuthForm mode="signup" />);
    expect(queryByRole('progressbar')).not.toBeInTheDocument();
    await userEvent.type(getByLabelText(/^password$/i), 'hunter2!!');
    expect(queryByRole('progressbar')).toBeInTheDocument();
  });

  it('calls onNeedsEmailConfirmation when signup returns no session', async () => {
    auth.signUpWithPassword.mockResolvedValueOnce({ needsEmailConfirmation: true });
    const onNeeds = vi.fn();
    const { getByRole, getByLabelText } = renderWithTheme(
      <AuthForm mode="signup" onNeedsEmailConfirmation={onNeeds} />,
    );
    await userEvent.type(getByLabelText(/full name/i), 'Ada Lovelace');
    await userEvent.type(getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(getByLabelText(/^password$/i), 'hunter2!!');
    await userEvent.click(getByLabelText(/legal age/i));
    await userEvent.click(getByLabelText(/agree to terms/i));
    await userEvent.click(getByRole('button', { name: /create account/i }));
    expect(onNeeds).toHaveBeenCalledWith('ada@example.com');
  });

  it('forgot mode hides password + Google and calls resetPassword', async () => {
    const onSubmitted = vi.fn();
    const { getByRole, getByLabelText, queryByLabelText, queryByRole } = renderWithTheme(
      <AuthForm mode="forgot" onForgotSubmitted={onSubmitted} />,
    );
    expect(queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(queryByRole('button', { name: /google/i })).not.toBeInTheDocument();
    await userEvent.type(getByLabelText(/email/i), 'ada@example.com');
    await userEvent.click(getByRole('button', { name: /send reset link/i }));
    expect(auth.resetPassword).toHaveBeenCalledWith('ada@example.com');
    expect(onSubmitted).toHaveBeenCalledWith('ada@example.com');
  });

  it('forgot link fires onForgotPassword in signin mode', async () => {
    const onForgot = vi.fn();
    const { getByRole } = renderWithTheme(<AuthForm mode="signin" onForgotPassword={onForgot} />);
    await userEvent.click(getByRole('button', { name: /forgot\?/i }));
    expect(onForgot).toHaveBeenCalledTimes(1);
  });

  it('Skip link fires onSkip', async () => {
    const onSkip = vi.fn();
    const { getByRole } = renderWithTheme(<AuthForm mode="signin" onSkip={onSkip} />);
    await userEvent.click(getByRole('button', { name: /skip — try it/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  // Regression: T-24/T-25 + ESIGN affirmative-consent. The Google + Skip
  // bypass the password form, but on signup mode they still create / claim
  // an account on our side, so the age-gate + ToS/Privacy attestation must
  // gate them too. Signin mode is unaffected — the user accepted at signup.
  it('disables "Sign up with Google" until both signup checkboxes are ticked', async () => {
    const { getByRole, getByLabelText } = renderWithTheme(<AuthForm mode="signup" />);
    const google = getByRole('button', { name: /sign up with google/i });
    expect(google).toBeDisabled();
    await userEvent.click(getByLabelText(/agree to terms/i));
    expect(google).toBeDisabled();
    await userEvent.click(getByLabelText(/legal age/i));
    expect(google).not.toBeDisabled();
    await userEvent.click(google);
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('does not gate "Continue with Google" in signin mode', () => {
    const { getByRole } = renderWithTheme(<AuthForm mode="signin" />);
    expect(getByRole('button', { name: /continue with google/i })).not.toBeDisabled();
  });

  it('disables Skip in signup mode until both checkboxes are ticked', async () => {
    const onSkip = vi.fn();
    const { getByRole, getByLabelText } = renderWithTheme(
      <AuthForm mode="signup" onSkip={onSkip} />,
    );
    const skip = getByRole('button', { name: /skip — try it/i });
    expect(skip).toBeDisabled();
    await userEvent.click(getByLabelText(/agree to terms/i));
    expect(skip).toBeDisabled();
    await userEvent.click(getByLabelText(/legal age/i));
    expect(skip).not.toBeDisabled();
    await userEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('surfaces provider errors in a banner', async () => {
    auth.signInWithPassword.mockRejectedValueOnce(new Error('Invalid login credentials'));
    const { getByRole, getByLabelText, findByRole } = renderWithTheme(<AuthForm mode="signin" />);
    await userEvent.type(getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(getByLabelText(/^password$/i), 'wrong');
    await userEvent.click(getByRole('button', { name: /sign in/i }));
    expect(await findByRole('alert')).toHaveTextContent(/invalid login credentials/i);
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(<AuthForm mode="signin" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
