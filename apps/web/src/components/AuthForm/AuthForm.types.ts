import type { HTMLAttributes } from 'react';

export type AuthFormMode = 'signin' | 'signup' | 'forgot';

export interface AuthFormProps extends HTMLAttributes<HTMLFormElement> {
  readonly mode: AuthFormMode;
  /** Called when user opts to skip auth and use the app as a guest. */
  readonly onSkip?: (() => void) | undefined;
  /** Called when the user presses the forgot-password link in signin mode. */
  readonly onForgotPassword?: (() => void) | undefined;
  /** Called when the user presses "Create an account" / "Sign in" footer. */
  readonly onSwitchMode?: ((mode: AuthFormMode) => void) | undefined;
  /** Called after signup when Supabase requires email confirmation. */
  readonly onNeedsEmailConfirmation?: ((email: string) => void) | undefined;
  /** Called after forgot-password submit succeeds. */
  readonly onForgotSubmitted?: ((email: string) => void) | undefined;
  /** Called after a successful sign-in / sign-up with an immediate session. */
  readonly onAuthed?: (() => void) | undefined;
}
