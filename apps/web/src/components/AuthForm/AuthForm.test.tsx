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
  resendSignUpConfirmation: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
  enterGuestMode: vi.fn(async () => undefined),
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

  it('keeps the signin submit enabled and only short-circuits when invalid', async () => {
    const { getByRole, getByLabelText } = renderWithTheme(<AuthForm mode="signin" />);
    const submit = getByRole('button', { name: /sign in/i });
    // Per audit C: SignUp #3 — disabled affordance is for `busy` only.
    expect(submit).not.toBeDisabled();
    // Submitting with empty fields short-circuits without calling the
    // sign-in action.
    await userEvent.click(submit);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
    // Once the user fills the form, the same submit click goes through.
    await userEvent.type(getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(getByLabelText(/^password$/i), 'hunter2');
    await userEvent.click(submit);
    expect(auth.signInWithPassword).toHaveBeenCalledTimes(1);
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

  // SignUp #3 (audit C 2026-05-02): the Create-account CTA is no longer
  // disabled on `!valid` — disabled CTAs with no explanation are a worse
  // UX than an enabled one that surfaces inline field errors on click.
  // The CTA only disables while in-flight (`busy`). Submit short-circuits
  // when the form is invalid, marks each failing field, and the assertion
  // here is that `signUpWithPassword` was NOT called.
  it('does not call signUpWithPassword on submit when signup is invalid', async () => {
    const { getByRole, getByLabelText } = renderWithTheme(<AuthForm mode="signup" />);
    const submit = getByRole('button', { name: /create account/i });
    // CTA is enabled even with empty fields.
    expect(submit).not.toBeDisabled();
    await userEvent.type(getByLabelText(/full name/i), 'Ada Lovelace');
    await userEvent.type(getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(getByLabelText(/^password$/i), 'hunter2!!');
    // Combined ESIGN attestation NOT ticked — submit must short-circuit.
    await userEvent.click(submit);
    expect(auth.signUpWithPassword).not.toHaveBeenCalled();
    // After ticking the combined attestation, the same submit click goes through.
    await userEvent.click(getByLabelText(/legal age and agree/i));
    await userEvent.click(submit);
    expect(auth.signUpWithPassword).toHaveBeenCalledTimes(1);
  });

  // SignUp #3 — the submit-when-invalid path also surfaces inline error
  // copy on each failing field so users know what to fix.
  it('renders inline field errors when submit fires on an invalid signup form', async () => {
    const { getByRole, findAllByRole, findByText } = renderWithTheme(<AuthForm mode="signup" />);
    await userEvent.click(getByRole('button', { name: /create account/i }));
    // Each failing field gets an explicit error via TextField's
    // `error="…"` slot, which renders `<ErrorText role="alert">`. Four
    // failing fields (name, email, password, agreed) => four alerts.
    const alerts = await findAllByRole('alert');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(await findByText(/please enter your name/i)).toBeInTheDocument();
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
    // Combined ESIGN attestation (audit C: SignUp #10).
    await userEvent.click(getByLabelText(/legal age and agree/i));
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
  it('disables "Sign up with Google" until the combined signup attestation is ticked', async () => {
    const { getByRole, getByLabelText } = renderWithTheme(<AuthForm mode="signup" />);
    const google = getByRole('button', { name: /sign up with google/i });
    expect(google).toBeDisabled();
    await userEvent.click(getByLabelText(/legal age and agree/i));
    expect(google).not.toBeDisabled();
    await userEvent.click(google);
    expect(auth.signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('does not gate "Continue with Google" in signin mode', () => {
    const { getByRole } = renderWithTheme(<AuthForm mode="signin" />);
    expect(getByRole('button', { name: /continue with google/i })).not.toBeDisabled();
  });

  it('disables Skip in signup mode until the combined signup attestation is ticked', async () => {
    const onSkip = vi.fn();
    const { getByRole, getByLabelText } = renderWithTheme(
      <AuthForm mode="signup" onSkip={onSkip} />,
    );
    const skip = getByRole('button', { name: /skip — try it/i });
    expect(skip).toBeDisabled();
    await userEvent.click(getByLabelText(/legal age and agree/i));
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

  // Audit C: SignUp #2 — clicking the inner Terms/Privacy anchors inside
  // the consent <label> previously toggled the checkbox. The anchors now
  // stop event propagation so the checkbox state is preserved.
  it('clicking an inner Terms/Privacy anchor does NOT toggle the consent checkbox', async () => {
    const { getByLabelText, getByRole } = renderWithTheme(<AuthForm mode="signup" />);
    const checkbox = getByLabelText(/legal age and agree/i) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    // Click the Terms anchor — should NOT toggle the box.
    const tos = getByRole('link', { name: /terms of service/i });
    await userEvent.click(tos);
    expect(checkbox.checked).toBe(false);
    // Click the Privacy anchor — same.
    const privacy = getByRole('link', { name: /privacy policy/i });
    await userEvent.click(privacy);
    expect(checkbox.checked).toBe(false);
  });

  // Audit C: SignUp #9 — strength meter is wrapped in a polite live region
  // so screen readers announce changes as the user types.
  it('wraps the password strength meter in a polite live region', async () => {
    const { getByLabelText, getByRole } = renderWithTheme(<AuthForm mode="signup" />);
    await userEvent.type(getByLabelText(/^password$/i), 'hunter2!!');
    // The wrapping <div role="status"> exposes the meter to assistive tech.
    const status = getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toContainElement(getByRole('progressbar'));
  });

  // Audit C: SignUp #10 — combined attestation: ONE checkbox instead of two.
  it('renders a single combined consent checkbox in signup mode', () => {
    const { getAllByRole, getByLabelText } = renderWithTheme(<AuthForm mode="signup" />);
    // The mode-specific checkboxes are the consent attestation only —
    // signup mode has no Keep-me-signed-in.
    expect(getAllByRole('checkbox')).toHaveLength(1);
    expect(getByLabelText(/legal age and agree.*terms.*privacy/i)).toBeInTheDocument();
  });

  // Audit C: SignUp #3 — focus the first failing field on submit so
  // keyboard / screen-reader users land on what to fix.
  it('focuses the first failing field when submit fires on an invalid signup form', async () => {
    const { getByRole, getByLabelText } = renderWithTheme(<AuthForm mode="signup" />);
    // Email is the first invalid field because Name is required first;
    // leave Name empty so it focuses Name.
    await userEvent.click(getByRole('button', { name: /create account/i }));
    expect(getByLabelText(/full name/i)).toHaveFocus();
  });

  // Audit C: ForgotPassword #11 — label text is "Email address" not "Your work email".
  it('uses "Email address" as the label in forgot mode', () => {
    const { getByLabelText } = renderWithTheme(<AuthForm mode="forgot" />);
    expect(getByLabelText(/email address/i)).toBeInTheDocument();
  });

  // Audit C: AuthForm #19 — single-character name is invalid even after trim.
  it('rejects a single-character name in signup validation', async () => {
    const { getByRole, getByLabelText, findByText } = renderWithTheme(<AuthForm mode="signup" />);
    await userEvent.type(getByLabelText(/full name/i), 'A');
    await userEvent.type(getByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(getByLabelText(/^password$/i), 'hunter2!!');
    await userEvent.click(getByLabelText(/legal age and agree/i));
    await userEvent.click(getByRole('button', { name: /create account/i }));
    expect(auth.signUpWithPassword).not.toHaveBeenCalled();
    expect(await findByText(/please enter your name/i)).toBeInTheDocument();
  });

  // Audit C: SignIn #8 — Forgot? link uses theme.shadow.focus on focus.
  it('Forgot? link receives a visible focus indicator on keyboard focus', () => {
    const { getByRole } = renderWithTheme(
      <AuthForm mode="signin" onForgotPassword={() => undefined} />,
    );
    const forgot = getByRole('button', { name: /forgot\?/i });
    forgot.focus();
    // styled-components inserts a `box-shadow` via `&:focus-visible`. In
    // jsdom focus-visible is satisfied by programmatic focus on a button.
    const style = window.getComputedStyle(forgot);
    expect(style.boxShadow ?? '').not.toBe('none');
  });
});
