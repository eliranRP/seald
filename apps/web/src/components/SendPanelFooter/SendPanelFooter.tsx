import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { ArrowRight, CheckCircle2, CircleDashed } from 'lucide-react';
import type { SendPanelFooterProps } from './SendPanelFooter.types';
import {
  DraftButton,
  DraftRow,
  PrimaryButton,
  Root,
  StatusCount,
  StatusLine,
  StatusText,
} from './SendPanelFooter.styles';

const DEFAULT_PRIMARY_LABEL = 'Send to Sign';
const DEFAULT_DISABLED_HINT = 'Place at least one field to enable sending';
const DEFAULT_MISSING_SIGNATURE_HINT = 'Place at least one signature field to enable sending';
const DEFAULT_SAVE_DRAFT_LABEL = 'Save as draft';

export const SendPanelFooter = forwardRef<HTMLDivElement, SendPanelFooterProps>((props, ref) => {
  const {
    fieldCount,
    signerCount,
    onSend,
    onSaveDraft,
    primaryLabel = DEFAULT_PRIMARY_LABEL,
    disabledHint = DEFAULT_DISABLED_HINT,
    saveDraftLabel = DEFAULT_SAVE_DRAFT_LABEL,
    signatureFieldCount,
    missingSignatureHint = DEFAULT_MISSING_SIGNATURE_HINT,
    ...rest
  } = props;

  // Two-stage readiness:
  //   1. ≥ 1 field of any kind (otherwise show the generic "place a field" hint),
  //   2. when the host opts into signature-gating, ≥ 1 SIGNATURE field
  //      (otherwise show the more specific hint and keep the button disabled).
  // The seald API rejects sends without a signature with
  // `signer_without_signature_field`; gating in the UI prevents that
  // error from reaching the user.
  const hasAnyField = fieldCount > 0;
  const hasSignatureField = signatureFieldCount === undefined || signatureFieldCount > 0;
  const ready = hasAnyField && hasSignatureField;
  const fieldWord = fieldCount === 1 ? 'field' : 'fields';
  const signerWord = signerCount === 1 ? 'signer' : 'signers';

  let statusContent: ReactNode;
  if (ready) {
    statusContent = (
      <>
        <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden />
        <StatusText>
          <StatusCount>{fieldCount}</StatusCount>
          {` ${fieldWord} · ${signerCount} ${signerWord}`}
        </StatusText>
      </>
    );
  } else {
    // Pick the most specific hint we can: if the user has placed
    // fields but none of them are signatures, point at the missing
    // signature; otherwise fall back to the generic "place a field"
    // copy.
    const hint = hasAnyField && !hasSignatureField ? missingSignatureHint : disabledHint;
    statusContent = (
      <>
        <CircleDashed size={14} strokeWidth={1.75} aria-hidden />
        <StatusText>{hint}</StatusText>
      </>
    );
  }

  let draftNode: ReactNode = null;
  if (onSaveDraft) {
    draftNode = (
      <DraftRow>
        <DraftButton type="button" onClick={onSaveDraft}>
          {saveDraftLabel}
        </DraftButton>
      </DraftRow>
    );
  }

  return (
    <Root {...rest} ref={ref} role="group" aria-label="Send document actions">
      <StatusLine $ready={ready} aria-live="polite">
        {statusContent}
      </StatusLine>
      <PrimaryButton
        type="button"
        $enabled={ready}
        disabled={!ready}
        onClick={onSend}
        aria-label={primaryLabel}
      >
        {primaryLabel}
        <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
      </PrimaryButton>
      {draftNode}
    </Root>
  );
});

SendPanelFooter.displayName = 'SendPanelFooter';
