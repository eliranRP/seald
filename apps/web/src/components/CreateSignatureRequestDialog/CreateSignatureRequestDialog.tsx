import { forwardRef, useCallback, useEffect, useId, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { AddSignerDropdown } from '../AddSignerDropdown';
import type { AddSignerContact } from '../AddSignerDropdown';
import { Button } from '../Button';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import type {
  CreateSignatureRequestDialogProps,
  CreateSignatureRequestDialogSigner,
} from './CreateSignatureRequestDialog.types';
import {
  AddReceiverButton,
  AddReceiverWrap,
  Backdrop,
  CancelButton,
  Card,
  Chip,
  ChipInitials,
  ChipList,
  ChipName,
  ChipRemove,
  EmptyHint,
  Footer,
  Subtitle,
  Title,
} from './CreateSignatureRequestDialog.styles';

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => (part[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('');
}

export const CreateSignatureRequestDialog = forwardRef<
  HTMLDivElement,
  CreateSignatureRequestDialogProps
>((props, ref) => {
  const {
    open,
    signers,
    contacts,
    onAddFromContact,
    onCreateContact,
    onRemoveSigner,
    onApply,
    onCancel,
    title = 'Create your signature request',
    subtitle = 'Who will receive your document?',
    applyLabel = 'Apply',
    cancelLabel = 'Cancel',
    addReceiverLabel = 'Add receiver',
    emptyHint = 'Add at least one receiver to continue.',
    ...rest
  } = props;

  const titleId = useId();
  const subtitleId = useId();
  const [pickerOpen, setPickerOpen] = useState<boolean>(false);

  // Auto-close the inline picker each time the dialog closes so reopening
  // starts clean.
  useEffect((): void => {
    if (!open) setPickerOpen(false);
  }, [open]);

  useEscapeKey(onCancel, open);

  const handleBackdropClick = useCallback((): void => {
    onCancel();
  }, [onCancel]);

  const handleCardClick = useCallback((e: ReactMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  }, []);

  const handlePick = useCallback(
    (contact: AddSignerContact): void => {
      // Toggle: remove the signer if already selected, otherwise add them.
      // The picker stays open so the user can pick several receivers in one go.
      const isSelected = signers.some((s) => s.id === contact.id);
      if (isSelected) {
        onRemoveSigner(contact.id);
      } else {
        onAddFromContact(contact);
      }
    },
    [onAddFromContact, onRemoveSigner, signers],
  );

  const handleCreate = useCallback(
    (name: string, email: string): void => {
      onCreateContact(name, email);
      // Keep the picker open so the user can continue selecting receivers.
    },
    [onCreateContact],
  );

  const handleOpenPicker = useCallback((): void => {
    setPickerOpen(true);
  }, []);

  const handleClosePicker = useCallback((): void => {
    setPickerOpen(false);
  }, []);

  if (!open) return null;

  const canApply = signers.length > 0;
  const selectedContactIds = signers.map((s) => s.id);

  return (
    <Backdrop onClick={handleBackdropClick} data-testid="create-signature-request-backdrop">
      <Card
        ref={ref}
        {...rest}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        onClick={handleCardClick}
      >
        <Title id={titleId}>{title}</Title>
        <Subtitle id={subtitleId}>{subtitle}</Subtitle>

        {signers.length === 0 ? (
          <EmptyHint role="status">{emptyHint}</EmptyHint>
        ) : (
          // Render selected receivers as compact chips that wrap horizontally
          // so the dialog keeps its width and height as more signers are added.
          <ChipList aria-label="Receivers">
            {signers.map((s: CreateSignatureRequestDialogSigner) => (
              <Chip key={s.id} title={s.email}>
                <ChipInitials $color={s.color} aria-hidden>
                  {initialsOf(s.name)}
                </ChipInitials>
                <ChipName>{s.name}</ChipName>
                <ChipRemove
                  type="button"
                  aria-label={`Remove receiver ${s.name}`}
                  onClick={() => onRemoveSigner(s.id)}
                >
                  <X size={12} strokeWidth={2} aria-hidden />
                </ChipRemove>
              </Chip>
            ))}
          </ChipList>
        )}

        {pickerOpen ? (
          <AddReceiverWrap>
            <AddSignerDropdown
              contacts={contacts}
              selectedIds={selectedContactIds}
              onPick={handlePick}
              onCreate={handleCreate}
              onClose={handleClosePicker}
            />
          </AddReceiverWrap>
        ) : (
          <AddReceiverButton type="button" onClick={handleOpenPicker}>
            <Plus size={14} strokeWidth={2} aria-hidden />
            {addReceiverLabel}
          </AddReceiverButton>
        )}

        <Footer>
          <CancelButton type="button" onClick={onCancel}>
            {cancelLabel}
          </CancelButton>
          <Button variant="primary" onClick={onApply} disabled={!canApply}>
            {applyLabel}
          </Button>
        </Footer>
      </Card>
    </Backdrop>
  );
});

CreateSignatureRequestDialog.displayName = 'CreateSignatureRequestDialog';
