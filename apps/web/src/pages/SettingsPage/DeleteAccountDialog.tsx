import { useId, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import {
  DialogBackdrop,
  DialogCard,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/DialogPrimitives';
import { DialogCenter, DialogIconBubble, NameInput } from './SettingsPage.styles';

/** The exact word the user types to arm the delete button. */
export const DELETE_CONFIRM_WORD = 'DELETE';

export interface DeleteAccountDialogProps {
  readonly open: boolean;
  /** True while the delete request runs. */
  readonly deleting: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/**
 * Type-to-confirm dialog for deleting the account. The danger button stays
 * disabled until the field holds exactly `DELETE` (case-sensitive). This
 * replaces the old `window.prompt`.
 */
export function DeleteAccountDialog({
  open,
  deleting,
  onCancel,
  onConfirm,
}: DeleteAccountDialogProps) {
  const [text, setText] = useState('');
  const titleId = useId();
  const descId = useId();
  useEscapeKey(onCancel, open && !deleting);

  if (!open) return null;
  const armed = text === DELETE_CONFIRM_WORD;

  return (
    <DialogBackdrop role="presentation" onClick={deleting ? undefined : onCancel}>
      <DialogCard
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogCenter>
          <DialogIconBubble $bad aria-hidden>
            <Icon icon={Trash2} size={32} />
          </DialogIconBubble>
          <DialogTitle id={titleId}>Delete your account?</DialogTitle>
          <DialogDescription id={descId}>
            Documents and contacts are erased. Sealed PDFs you sent stay with signers.
          </DialogDescription>
          <NameInput
            type="text"
            placeholder={`Type ${DELETE_CONFIRM_WORD}`}
            aria-label={`Type ${DELETE_CONFIRM_WORD} to confirm`}
            autoComplete="off"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </DialogCenter>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!armed}
            loading={deleting}
            onClick={armed ? onConfirm : undefined}
          >
            Delete account
          </Button>
        </DialogFooter>
      </DialogCard>
    </DialogBackdrop>
  );
}
