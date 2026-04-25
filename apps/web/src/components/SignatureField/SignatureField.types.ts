import type { HTMLAttributes } from 'react';
import type { FieldKind } from '@/types/sealdTypes';

/** Placeholder chip representing a signer's field on a (future) PDF page. */
export interface SignatureFieldProps extends HTMLAttributes<HTMLDivElement> {
  readonly kind: FieldKind;
  readonly signerName: string;
  readonly filled?: boolean | undefined;
  readonly selected?: boolean | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}
