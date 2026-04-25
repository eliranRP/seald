import type { SignatureValue } from '@/types/sealdTypes';

export interface UploadModeProps {
  /** Called when a valid image file has been read into a data URL. */
  readonly onCommit: (value: Extract<SignatureValue, { kind: 'upload' }>) => void;
  /** Called when the user cancels the upload attempt. */
  readonly onCancel: () => void;
  /** Maximum allowed file size in bytes. Defaults to 2 MiB. */
  readonly maxBytes?: number | undefined;
}
