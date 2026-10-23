export interface SignBarProps {
  /** Required fields the signer fills by hand, done and total. */
  readonly done: number;
  readonly total: number;
  /** Optional fields left blank; shown once everything required is done. */
  readonly optionalLeft: number;
  /** Everything required is filled: the primary button becomes Finish. */
  readonly ready: boolean;
  readonly onNext: () => void;
  readonly onFinish: () => void;
}
