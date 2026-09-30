import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../Button';
import { DialogDescription, DialogFooter, DialogTitle } from '../DialogPrimitives';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { SecretOnceSheetProps } from './SecretOnceSheet.types';
import {
  Alert,
  Backdrop,
  Card,
  ConfirmBackdrop,
  Footer,
  Secret,
  Status,
} from './SecretOnceSheet.styles';

/**
 * Shows a secret once. Backdrop taps do nothing. Close and Escape before
 * a successful copy ask first. The parent clears the secret when `onClose`
 * runs.
 */
export function SecretOnceSheet(props: SecretOnceSheetProps) {
  const { secret, onClose } = props;
  const titleId = useId();
  const descId = useId();
  const confirmTitleId = useId();
  const confirmDescId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const secretRef = useRef<HTMLParagraphElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function requestClose(): void {
    if (copied) onClose();
    else setConfirming(true);
  }

  const { onKeyDown } = useFocusTrap(cardRef, {
    enabled: true,
    initialFocusRef: copyRef,
    onEscape: requestClose,
  });
  const confirmTrap = useFocusTrap(confirmRef, {
    enabled: confirming,
    initialFocusRef: keepRef,
    onEscape: () => setConfirming(false),
  });

  useEffect(() => {
    if (!copyFailed) return;
    const node = secretRef.current;
    if (!node) return;
    node.focus();
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [copyFailed]);

  async function copy(): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard');
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  return (
    <>
      <Backdrop role="presentation">
        <Card
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onKeyDown={onKeyDown}
        >
          <DialogTitle id={titleId}>New key</DialogTitle>
          <DialogDescription id={descId}>
            Copy it now. This is the only time it is shown.
          </DialogDescription>
          <Secret ref={secretRef} dir="ltr" tabIndex={0}>
            {secret}
          </Secret>
          <Status role="status">{copied ? 'Copied' : ''}</Status>
          {copyFailed ? <Alert role="alert">Copy failed — select and copy manually</Alert> : null}
          <Footer>
            <Button
              ref={copyRef}
              type="button"
              variant="primary"
              size="lg"
              onClick={() => void copy()}
            >
              Copy key
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={requestClose}>
              Close
            </Button>
          </Footer>
        </Card>
      </Backdrop>
      {confirming ? (
        <ConfirmBackdrop role="presentation" onClick={() => setConfirming(false)}>
          <Card
            ref={confirmRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            aria-describedby={confirmDescId}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={confirmTrap.onKeyDown}
          >
            <DialogTitle id={confirmTitleId}>Close without copying?</DialogTitle>
            <DialogDescription id={confirmDescId}>
              You won&apos;t see this key again.
            </DialogDescription>
            <DialogFooter>
              <Button
                ref={keepRef}
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => setConfirming(false)}
              >
                Keep open
              </Button>
              <Button type="button" variant="danger" size="lg" onClick={onClose}>
                Close anyway
              </Button>
            </DialogFooter>
          </Card>
        </ConfirmBackdrop>
      ) : null}
    </>
  );
}
