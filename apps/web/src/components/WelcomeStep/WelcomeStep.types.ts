export interface WelcomeStepProps {
  /** Verified address of the new account, shown under the title. */
  readonly email: string;
  /** Name to pre-fill (e.g. from a Google profile). */
  readonly initialName?: string | undefined;
  /**
   * Saves the profile (name + terms acceptance). A rejection shows an
   * error banner and keeps the form editable; the parent navigates on success.
   */
  readonly onSubmit: (fullName: string) => Promise<void>;
}
