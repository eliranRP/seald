import { forwardRef, useId } from 'react';
import { Trash2 } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { Button } from '../Button';
import { DialogBackdrop, DialogCard, DialogTitle } from '../DialogPrimitives';
import { Icon } from '../Icon';
import type { ConfirmDeleteDialogProps } from './ConfirmDeleteDialog.types';
import { Actions, Body, Note, StateIcon } from './ConfirmDeleteDialog.styles';

/**
 * L1 primitive: the delete confirmation shared by Templates and Contacts
 * (canvas modal with `.state-ico.is-bad`). Escape and a click on the scrim
 * keep the item. Focus starts on "Keep" so a stray Enter never deletes.
 */
export const ConfirmDeleteDialog = forwardRef<HTMLDivElement, ConfirmDeleteDialogProps>(
  (props, ref) => {
    const {
      open,
      title,
      note,
      children,
      keepLabel = 'Keep',
      deleteLabel = 'Delete',
      onConfirm,
      onCancel,
      ...rest
    } = props;
    const titleId = useId();
    useEscapeKey(onCancel, open);
    if (!open) return null;
    return (
      <DialogBackdrop role="presentation" onClick={onCancel}>
        <DialogCard
          ref={ref}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(e) => e.stopPropagation()}
          {...rest}
        >
          <Body>
            <StateIcon aria-hidden>
              <Icon icon={Trash2} size={28} />
            </StateIcon>
            <DialogTitle id={titleId}>{title}</DialogTitle>
            {children}
            {note ? <Note>{note}</Note> : null}
          </Body>
          <Actions>
            <Button variant="ghost" onClick={onCancel} autoFocus>
              {keepLabel}
            </Button>
            <Button variant="danger" onClick={onConfirm}>
              {deleteLabel}
            </Button>
          </Actions>
        </DialogCard>
      </DialogBackdrop>
    );
  },
);

ConfirmDeleteDialog.displayName = 'ConfirmDeleteDialog';
