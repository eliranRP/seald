import type { HTMLAttributes } from 'react';

export type SignatureCaptureFormat = 'drawn' | 'typed' | 'upload';
export type SignatureCaptureKind = 'signature' | 'initials';

export interface SignatureCaptureResult {
  readonly blob: Blob;
  readonly format: SignatureCaptureFormat;
  readonly font?: string | undefined;
  readonly stroke_count?: number | undefined;
  readonly source_filename?: string | undefined;
}

export interface SignatureCaptureProps extends HTMLAttributes<HTMLDivElement> {
  readonly open: boolean;
  readonly kind: SignatureCaptureKind;
  readonly defaultName: string;
  readonly onCancel: () => void;
  readonly onApply: (result: SignatureCaptureResult) => void;
}
