import { useEffect, useRef, useState } from 'react';
import { Button } from '../Button';
import {
  DialogBackdrop,
  DialogCard,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../DialogPrimitives';
import type { SecretOnceSheetProps } from './SecretOnceSheet.types';
import { Secret } from './SecretOnceSheet.styles';

/**
 * Shows a secret once. Closing drops it: the parent must unmount this
 * sheet and clear the value. Copy is the only action besides Close.
 */
export function SecretOnceSheet(props: SecretOnceSheetProps) {
  const { secret, onClose } = props;
  const copyRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    copyRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <DialogBackdrop onClick={onClose}>
      <DialogCard
        role="dialog"
        aria-modal="true"
        aria-labelledby="secret-once-title"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogTitle id="secret-once-title">New key</DialogTitle>
        <DialogDescription>Copy it now. This is the only time it is shown.</DialogDescription>
        <Secret>{secret}</Secret>
        <DialogFooter>
          <Button
            ref={copyRef}
            type="button"
            variant="primary"
            size="lg"
            onClick={() => void copy()}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogCard>
    </DialogBackdrop>
  );
}
