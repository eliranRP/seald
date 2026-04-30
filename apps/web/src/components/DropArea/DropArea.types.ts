import type { HTMLAttributes, ReactNode } from 'react';

/**
 * `'type'`  — file's MIME / extension didn't match `accept`.
 * `'size'`  — file exceeded `maxSizeBytes`.
 */
export type DropAreaErrorCode = 'type' | 'size';

export interface DropAreaProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onError' | 'children'> {
  /** Fires with the validated file after a successful drop or picker selection. */
  readonly onFileSelected: (file: File) => void;
  /** Fires when the file fails the local accept/size check. The host can
   *  hoist this to a toast on top of the inline error text. */
  readonly onError?: ((code: DropAreaErrorCode, message: string) => void) | undefined;

  /** Default `application/pdf,.pdf`. */
  readonly accept?: string | undefined;
  /** Default 25 MB. */
  readonly maxSizeBytes?: number | undefined;

  /** Big serif heading. Default "Drop your PDF here". */
  readonly heading?: string | undefined;
  /** Smaller secondary line. Default mentions size limit. */
  readonly subheading?: ReactNode | undefined;
  /** Choose-file button copy. Default "Choose file". */
  readonly chooseLabel?: string | undefined;
}
