import { useEffect, useId } from 'react';
import { Button } from '@/components/Button';
import {
  Backdrop,
  Card,
  Description,
  FileNameRow,
  Footer,
  IndeterminateBar,
  Title,
} from './dialogStyles';

export interface ConversionProgressDialogProps {
  readonly open: boolean;
  readonly fileName: string;
  readonly onCancel: () => void;
}

/**
 * Modal shown while a Drive file is being converted to PDF (WT-D).
 *
 * Indeterminate by design — the API does not stream byte-level progress
 * (Gotenberg's LibreOffice render is opaque), so a percentage would be
 * a lie. Per WAI-ARIA 1.2 §5.4 a progressbar without `aria-valuenow` is
 * the correct way to mark a busy-but-unknown task.
 *
 * Esc + backdrop click forward to `onCancel`, which the orchestrator
 * pipes into `cancelImport()` (DELETE /:jobId).
 */
export function ConversionProgressDialog({
  open,
  fileName,
  onCancel,
}: ConversionProgressDialogProps) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <Backdrop role="presentation" onClick={onCancel}>
      <Card
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <Title id={titleId}>Converting your document</Title>
        <Description id={descId}>
          We&apos;re turning your Drive file into a PDF so you can place signature fields. This
          usually takes a few seconds.
        </Description>
        <FileNameRow>{fileName}</FileNameRow>
        <IndeterminateBar role="progressbar" aria-label="Converting" />
        <Footer>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </Footer>
      </Card>
    </Backdrop>
  );
}
