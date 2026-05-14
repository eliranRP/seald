import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { AuthShell } from '@/components/AuthShell';
import { AuthForm } from '@/components/AuthForm';
import type { AuthFormMode } from '@/components/AuthForm/AuthForm.types';
import { pathForAuthMode } from '@/layout/authPaths';

/**
 * Audit C: ForgotPassword #12 — without `GoogleButton`+`Divider` above
 * the heading the forgot-password heading anchors lower than Sign-in,
 * breaking the visual continuity SignIn → "Forgot?" → Forgot. A
 * ~110 px spacer compensates for the missing affordances above the
 * heading without retrofitting the form's vertical centering rule.
 *
 * Hidden on phones — `FormSide` already anchors to the top via the
 * mobile media-query in `AuthShell.styles.ts` (audit D §10), so an
 * additional 110 px above the heading would push the form below the
 * keyboard.
 */
const VerticalSpacer = styled.div`
  height: 110px;
  @media (max-width: 640px) {
    display: none;
  }
`;

/**
 * L4 page — `/forgot-password`. After a successful submit, routes the user
 * to `/check-email?email=…&mode=reset` so the post-submit copy can reference
 * the address they entered.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();

  const handleSubmitted = useCallback(
    (email: string): void => {
      navigate(`/check-email?email=${encodeURIComponent(email)}&mode=reset`);
    },
    [navigate],
  );

  const handleSwitch = useCallback(
    (next: AuthFormMode): void => {
      navigate(pathForAuthMode(next));
    },
    [navigate],
  );

  return (
    <AuthShell>
      <VerticalSpacer aria-hidden="true" />
      <AuthForm mode="forgot" onForgotSubmitted={handleSubmitted} onSwitchMode={handleSwitch} />
    </AuthShell>
  );
}
