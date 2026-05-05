import { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button } from '../Button';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import type { SelectSignersPopoverProps } from './SelectSignersPopover.types';
import {
  Backdrop,
  CancelButton,
  Card,
  CheckBox,
  ColorDot,
  Footer,
  List,
  Row,
  RowButton,
  RowName,
  Title,
} from './SelectSignersPopover.styles';

export const SelectSignersPopover = forwardRef<HTMLDivElement, SelectSignersPopoverProps>(
  (props, ref) => {
    const {
      open,
      signers,
      initialSelectedIds,
      onApply,
      onCancel,
      title = 'Select signers',
      applyLabel = 'Apply',
      cancelLabel = 'Cancel',
      ...rest
    } = props;

    const titleId = useId();
    const prevOpenRef = useRef<boolean>(open);
    const [selectedIds, setSelectedIds] = useState<ReadonlyArray<string>>(initialSelectedIds ?? []);

    // Reset selection when transitioning false -> true.
    useEffect((): void => {
      const wasOpen = prevOpenRef.current;
      prevOpenRef.current = open;
      if (!wasOpen && open) {
        setSelectedIds(initialSelectedIds ?? []);
      }
    }, [open, initialSelectedIds]);

    useEscapeKey(onCancel, open);

    const toggle = useCallback((id: string): void => {
      setSelectedIds((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        return [...prev, id];
      });
    }, []);

    const handleBackdropClick = useCallback((): void => {
      onCancel();
    }, [onCancel]);

    const handleCardClick = useCallback((e: ReactMouseEvent<HTMLDivElement>): void => {
      e.stopPropagation();
    }, []);

    const handleApply = useCallback((): void => {
      onApply(selectedIds);
    }, [onApply, selectedIds]);

    if (!open) return null;

    const rows: ReactNode = signers.map((s) => {
      const checked = selectedIds.includes(s.id);
      return (
        <Row key={s.id}>
          <RowButton
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={s.name}
            onClick={() => toggle(s.id)}
          >
            <CheckBox $checked={checked} aria-hidden>
              {checked ? <Check size={14} strokeWidth={2.25} /> : null}
            </CheckBox>
            <ColorDot $color={s.color} aria-hidden />
            <RowName>{s.name}</RowName>
          </RowButton>
        </Row>
      );
    });

    return (
      <Backdrop onClick={handleBackdropClick} data-testid="select-signers-backdrop">
        <Card
          ref={ref}
          {...rest}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={handleCardClick}
        >
          <Title id={titleId}>{title}</Title>
          <List>{rows}</List>
          <Footer>
            <CancelButton type="button" onClick={onCancel}>
              {cancelLabel}
            </CancelButton>
            <Button variant="primary" onClick={handleApply}>
              {applyLabel}
            </Button>
          </Footer>
        </Card>
      </Backdrop>
    );
  },
);

SelectSignersPopover.displayName = 'SelectSignersPopover';
