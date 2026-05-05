import { forwardRef, useId } from 'react';
import { Button } from '../Button';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import {
  DialogBackdrop,
  DialogCard,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../DialogPrimitives';
import type { ExitConfirmDialogProps } from './ExitConfirmDialog.types';

/**
 * L3 widget — lightweight confirm dialog for the "leave without sending"
 * interaction. Intentionally a thin, theme-styled modal rather than pulling in
 * a full dialog primitive, since the app only needs a single destructive
 * confirm prompt surface.
 *
 * Esc closes the dialog (cancel). Clicking the backdrop also cancels. The
 * primary action is rendered first so it takes focus on open.
 */
export const ExitConfirmDialog = forwardRef<HTMLDivElement, ExitConfirmDialogProps>(
  (props, ref) => {
    const {
      open,
      title = 'Leave without sending?',
      description = "Your field placements will be kept as a draft, but the signers won't receive the document until you send it.",
      confirmLabel = 'Leave anyway',
      cancelLabel = 'Keep editing',
      onConfirm,
      onCancel,
      ...rest
    } = props;

    const titleId = useId();
    const descId = useId();

    useEscapeKey(onCancel, open);

    if (!open) return null;

    return (
      <DialogBackdrop role="presentation" onClick={onCancel}>
        <DialogCard
          ref={ref}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onClick={(e) => e.stopPropagation()}
          {...rest}
        >
          <DialogTitle id={titleId}>{title}</DialogTitle>
          <DialogDescription id={descId}>{description}</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant="danger" onClick={onConfirm} autoFocus>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogCard>
      </DialogBackdrop>
    );
  },
);

ExitConfirmDialog.displayName = 'ExitConfirmDialog';
