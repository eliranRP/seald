export interface SessionExpiredDialogProps {
  readonly open: boolean;
  /** "Sign in again": the host signs out locally and goes to /signin?next=… */
  readonly onSignIn: () => void;
  /** Phones get a bottom sheet with a full-width button instead of a modal. */
  readonly mobile?: boolean | undefined;
}
