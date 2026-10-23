import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { SheetDialog } from '@/components/SheetDialog';
import { Text } from './ConfirmSheet.styles';
import type { ConfirmSheetProps } from './ConfirmSheet.types';

/** Plain confirm for an irreversible signer action (withdraw consent, not me). */
export function ConfirmSheet(props: ConfirmSheetProps) {
  const {
    open,
    onClose,
    title,
    children,
    confirmLabel,
    cancelLabel,
    danger = true,
    busy = false,
    error,
    onConfirm,
  } = props;

  return (
    <SheetDialog
      open={open}
      onClose={onClose}
      title={title}
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={busy}
            disabled={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Text>{children}</Text>
      {error ? <Banner tone="error">{error}</Banner> : null}
    </SheetDialog>
  );
}
