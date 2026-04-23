import { forwardRef, useEffect, useId } from 'react';
import { Button } from '../Button';
import type { ExitConfirmDialogProps } from './ExitConfirmDialog.types';
import { Backdrop, Card, Description, Footer, Title } from './ExitConfirmDialog.styles';

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
          ref={ref}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          onClick={(e) => e.stopPropagation()}
          {...rest}
        >
          <Title id={titleId}>{title}</Title>
          <Description id={descId}>{description}</Description>
          <Footer>
            <Button variant="ghost" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant="danger" onClick={onConfirm} autoFocus>
              {confirmLabel}
            </Button>
          </Footer>
        </Card>
      </Backdrop>
    );
  },
);

ExitConfirmDialog.displayName = 'ExitConfirmDialog';
