import { useEffect, useId } from 'react';
import { Button } from '@/components/Button';
import type { ConversionErrorCode } from './conversionApi';
import { Backdrop, Card, Description, Footer, Title } from './dialogStyles';

/**
 * Human copy for each WT-A-1 / WT-D error code. The orchestrator picks
 * one based on the API response and the dialog reads from this map.
 *
 * `cancelled` is intentionally omitted — the orchestrator treats user
 * cancels as a benign close and never opens the failed dialog for them.
 */
export const MESSAGES = {
  'unsupported-mime':
    'We can only import PDFs, Google Docs, and Word (.docx) files. Pick a different document and try again.',
  'file-too-large':
    'That file is over the 25 MB limit. Try a smaller PDF, or split the document into shorter sections.',
  'token-expired':
    'Your Google Drive connection expired. Reconnect from Settings → Integrations and try again.',
  'oauth-declined':
    "We don't have access to that file anymore. Reconnect Google Drive or pick a different file.",
  'conversion-failed':
    'Something went wrong converting your document. Try again, or upload a PDF instead.',
  'rate-limited': "You're going a little fast for Drive. Wait a moment and try again.",
  'no-files-match-filter':
    "We couldn't find a matching file in your Drive. Pick a different one and try again.",
} as const satisfies Record<Exclude<ConversionErrorCode, 'cancelled'>, string>;

export interface ConversionFailedDialogProps {
  readonly open: boolean;
  readonly errorCode: ConversionErrorCode;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}

export function ConversionFailedDialog({
  open,
  errorCode,
  onRetry,
  onClose,
}: ConversionFailedDialogProps) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  // `cancelled` is a synthesized client-side state and never surfaces
  // here in practice (the orchestrator skips opening this dialog for
  // it). Fall back to the generic message rather than blank-rendering
  // so a caller who forgets the gate still sees something useful.
  const message = errorCode === 'cancelled' ? MESSAGES['conversion-failed'] : MESSAGES[errorCode];

  return (
    <Backdrop role="presentation" onClick={onClose}>
      <Card
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <Title id={titleId}>Couldn&apos;t import that file</Title>
        <Description id={descId}>{message}</Description>
        <Footer>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={onRetry} autoFocus>
            Try again
          </Button>
        </Footer>
      </Card>
    </Backdrop>
  );
}
