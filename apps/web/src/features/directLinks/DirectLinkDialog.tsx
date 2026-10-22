import { useId } from 'react';
import styled from 'styled-components';
import { Button } from '@/components/Button';
import { DialogBackdrop, DialogCard, DialogFooter } from '@/components/DialogPrimitives';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { DirectLinkPanel, type DirectLinkPanelProps } from './DirectLinkPanel';

const Card = styled(DialogCard)`
  max-width: 560px;
  max-height: calc(100vh - ${({ theme }) => theme.space[10]});
  overflow-y: auto;
`;

export interface DirectLinkDialogProps extends DirectLinkPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

/** Template settings as a modal: the Direct link panel with a Close button. */
export function DirectLinkDialog({ open, onClose, template }: DirectLinkDialogProps) {
  const labelId = useId();
  useEscapeKey(onClose, open);
  if (!open) return null;
  return (
    <DialogBackdrop role="presentation" onClick={onClose}>
      <Card
        role="dialog"
        aria-modal="true"
        aria-label={`Direct link for ${template.name}`}
        aria-describedby={labelId}
        onClick={(e) => e.stopPropagation()}
      >
        <span id={labelId} hidden>
          Settings for the public link that starts a signing request from {template.name}.
        </span>
        <DirectLinkPanel template={template} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </Card>
    </DialogBackdrop>
  );
}
