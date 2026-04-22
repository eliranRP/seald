import { forwardRef, useCallback, useEffect, useId, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type {
  RemoveLinkedCopiesDialogProps,
  RemoveLinkedScope,
} from './RemoveLinkedCopiesDialog.types';
import {
  Backdrop,
  CancelButton,
  Card,
  Footer,
  OptionLabel,
  OptionList,
  Radio,
  RemoveButton,
  Title,
} from './RemoveLinkedCopiesDialog.styles';

/**
 * Confirmation dialog shown when the user removes a field that has linked
 * copies on other pages. Lets them choose whether to wipe just this page's
 * copy or every linked copy across the document. Modeled on the design in
 * the Figma spec: two-radio question + red primary Remove button.
 */
export const RemoveLinkedCopiesDialog = forwardRef<HTMLDivElement, RemoveLinkedCopiesDialogProps>(
  (props, ref) => {
    const {
      open,
      linkedCount,
      onConfirm,
      onCancel,
      title = 'Remove linked copies',
      confirmLabel = 'Remove',
      cancelLabel = 'Cancel',
      ...rest
    } = props;

    const titleId = useId();
    const radioName = useId();
    // Default to the safer scope — removing just the page the user is on.
    // Reset to this default every time the dialog opens so a previous "All
    // pages" selection doesn't silently carry over into a later removal.
    const [scope, setScope] = useState<RemoveLinkedScope>('only-this');
    useEffect((): void => {
      if (open) setScope('only-this');
    }, [open]);

    useEffect((): (() => void) | undefined => {
      if (!open) return undefined;
      const handleKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') onCancel();
      };
      window.addEventListener('keydown', handleKey);
      return (): void => {
        window.removeEventListener('keydown', handleKey);
      };
    }, [open, onCancel]);

    const handleBackdropClick = useCallback((): void => {
      onCancel();
    }, [onCancel]);

    const handleCardClick = useCallback((e: ReactMouseEvent<HTMLDivElement>): void => {
      e.stopPropagation();
    }, []);

    const handleConfirm = useCallback((): void => {
      onConfirm(scope);
    }, [onConfirm, scope]);

    if (!open) return null;

    // Pluralize the "All pages" helper count — "All 3 pages" reads better
    // than "All 3 page" when someone has duplicated onto exactly 2 peers.
    const allPagesLabel = linkedCount > 1 ? `All pages (${String(linkedCount)})` : 'All pages';

    return (
      <Backdrop onClick={handleBackdropClick} data-testid="remove-linked-copies-backdrop">
        <Card
          ref={ref}
          {...rest}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={handleCardClick}
        >
          <Title id={titleId}>{title}</Title>

          <OptionList role="radiogroup" aria-labelledby={titleId}>
            <OptionLabel>
              <Radio
                name={radioName}
                value="only-this"
                checked={scope === 'only-this'}
                onChange={() => setScope('only-this')}
              />
              Only this page
            </OptionLabel>
            <OptionLabel>
              <Radio
                name={radioName}
                value="all-pages"
                checked={scope === 'all-pages'}
                onChange={() => setScope('all-pages')}
              />
              {allPagesLabel}
            </OptionLabel>
          </OptionList>

          <Footer>
            <CancelButton type="button" onClick={onCancel}>
              {cancelLabel}
            </CancelButton>
            <RemoveButton type="button" onClick={handleConfirm}>
              {confirmLabel}
            </RemoveButton>
          </Footer>
        </Card>
      </Backdrop>
    );
  },
);

RemoveLinkedCopiesDialog.displayName = 'RemoveLinkedCopiesDialog';
