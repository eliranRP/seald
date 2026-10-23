export interface ScanWithPhoneDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** "Continue": the scanned PDF the phone sent, ready for the Prepare step. */
  readonly onContinue: (pdf: File) => void;
}

export type ScanWithPhoneState =
  | { readonly kind: 'creating' }
  | { readonly kind: 'error' }
  | {
      readonly kind: 'qr';
      readonly code: string;
      readonly expiresAt: number;
    }
  | { readonly kind: 'fetching'; readonly code: string; readonly pageCount: number | null }
  | { readonly kind: 'received'; readonly pdf: File; readonly pageCount: number | null }
  | { readonly kind: 'expired' };
