import { useId } from 'react';
import { Button } from '@/components/Button';
import {
  DialogBackdrop,
  DialogCard,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/DialogPrimitives';
import { useEscapeKey } from '@/hooks/useEscapeKey';

export interface ConfirmDialogProps {
  readonly title: string;
  readonly description?: string;
  readonly confirmLabel: string;
  readonly busy?: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/** Destructive confirmation (cancel a request, delete drafts). */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { title, description, confirmLabel, busy = false, onCancel, onConfirm } = props;
  const titleId = useId();
  const descId = useId();
  useEscapeKey(onCancel, true);
  return (
    <DialogBackdrop role="presentation" onClick={onCancel}>
      <DialogCard
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogTitle id={titleId}>{title}</DialogTitle>
        {description ? <DialogDescription id={descId}>{description}</DialogDescription> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Keep
          </Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogCard>
    </DialogBackdrop>
  );
}
