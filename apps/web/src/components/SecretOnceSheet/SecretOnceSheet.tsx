import { Check, Copy } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { Button } from '../Button';
import { MWBottomSheet } from '../MWBottomSheet';
import { Description, Extra, Secret, SecretRow } from './SecretOnceSheet.styles';
import type { SecretOnceSheetProps } from './SecretOnceSheet.types';

/**
 * Show-once sheet for a secret (API key, webhook secret). Copy and Close
 * only: no checkbox and no "I saved it" step. The value lives in props, so
 * closing the sheet and clearing the parent state drops it.
 */
export function SecretOnceSheet({
  open,
  onClose,
  title,
  secret,
  description,
  children,
}: SecretOnceSheetProps) {
  const { copied, copy } = useCopyToClipboard();
  if (!open) return null;
  return (
    <MWBottomSheet open onClose={onClose} title={title}>
      {description ? <Description>{description}</Description> : null}
      <SecretRow>
        <Secret tabIndex={0} aria-label="Secret value">
          {secret}
        </Secret>
        <Button
          iconLeft={copied ? Check : Copy}
          onClick={() => {
            void copy(secret);
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </SecretRow>
      {children ? <Extra>{children}</Extra> : null}
      <Button variant="ghost" fullWidth onClick={onClose}>
        Close
      </Button>
    </MWBottomSheet>
  );
}
