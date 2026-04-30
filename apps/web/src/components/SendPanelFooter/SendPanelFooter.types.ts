import type { HTMLAttributes } from 'react';

export interface SendPanelFooterProps extends HTMLAttributes<HTMLDivElement> {
  readonly fieldCount: number;
  readonly signerCount: number;
  readonly onSend: () => void;
  readonly onSaveDraft?: (() => void) | undefined;
  readonly primaryLabel?: string | undefined;
  readonly disabledHint?: string | undefined;
  readonly saveDraftLabel?: string | undefined;
  /**
   * When provided, the Send CTA is gated on ≥ 1 signature field
   * placed (vs. ≥ 1 field of any kind). The seald API rejects
   * envelopes that don't carry a signature with
   * `signer_without_signature_field`; surfacing the gate in the UI
   * prevents the user from clicking through to that error.
   * Omit to preserve the legacy gate (templates flow, etc.).
   */
  readonly signatureFieldCount?: number | undefined;
  /**
   * Hint shown on the status line when the user has fields but none
   * are signatures. Defaults to a copy that names the missing kind.
   */
  readonly missingSignatureHint?: string | undefined;
}
