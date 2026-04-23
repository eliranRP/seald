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
    ...rest
  } = props;

  const ready = fieldCount > 0;
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
    statusContent = (
      <>
        <CircleDashed size={14} strokeWidth={1.75} aria-hidden />
        <StatusText>{disabledHint}</StatusText>
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
