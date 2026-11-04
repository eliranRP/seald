import { useEffect, useId, useRef } from 'react';
import type { JSX } from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { Button } from '../Button';
import { DialogBackdrop, DialogBody, DialogFoot, DialogHead } from '../DialogPrimitives';
import { MWBottomSheet } from '../MWBottomSheet';
import { useModalFocus } from '../shared/useModalFocus';
import type { ResponsiveDialogProps } from './ResponsiveDialog.types';
import { Body, Card, FootStart, SheetFoot, Title } from './ResponsiveDialog.styles';

/**
 * L3 widget: a modal with a head, a scrolling body and a footer on desktop,
 * a bottom sheet on phones (≤640px). Escape and a click on the scrim close
 * it. The Add contacts, Edit contact and Use template screens share it.
 * On desktop focus moves into the card on open (a `data-autofocus` child,
 * else the first field, else the card), Tab stays inside, and focus
 * returns to the trigger on close; the sheet does the same on phones.
 */
export function ResponsiveDialog(props: ResponsiveDialogProps): JSX.Element | null {
  const { open, onClose, title, width = 520, footer, footerStart, children } = props;
  const titleId = useId();
  const isMobile = useIsMobileViewport();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const desktopOpen = open && !isMobile;
  useEscapeKey(onClose, desktopOpen);
  useModalFocus(cardRef, desktopOpen);

  useEffect(() => {
    if (!desktopOpen) return;
    const card = cardRef.current;
    if (!card || card.contains(document.activeElement)) return;
    const target =
      card.querySelector<HTMLElement>('[data-autofocus]') ??
      card.querySelector<HTMLElement>('input:not([disabled]),textarea:not([disabled])') ??
      card;
    target.focus();
  }, [desktopOpen]);

  if (!open) return null;

  if (isMobile) {
    return (
      <MWBottomSheet open onClose={onClose} title={title} labelledBy={titleId}>
        <Body>{children}</Body>
        {footer || footerStart ? (
          <SheetFoot>
            {footerStart ? <FootStart>{footerStart}</FootStart> : null}
            {footer}
          </SheetFoot>
        ) : null}
      </MWBottomSheet>
    );
  }

  return (
    <DialogBackdrop role="presentation" onClick={onClose}>
      <Card
        ref={cardRef}
        tabIndex={-1}
        $width={width}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHead>
          <Title id={titleId}>{title}</Title>
          <Button variant="ghost" iconOnly iconLeft={X} aria-label="Close" onClick={onClose} />
        </DialogHead>
        <DialogBody>
          <Body>{children}</Body>
        </DialogBody>
        {footer || footerStart ? (
          <DialogFoot>
            {footerStart ? <FootStart>{footerStart}</FootStart> : null}
            {footer}
          </DialogFoot>
        ) : null}
      </Card>
    </DialogBackdrop>
  );
}
