import { useId } from 'react';
import type { JSX } from 'react';
import { X } from 'lucide-react';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { Button } from '../Button';
import { DialogBackdrop, DialogBody, DialogFoot, DialogHead } from '../DialogPrimitives';
import { MWBottomSheet } from '../MWBottomSheet';
import type { ResponsiveDialogProps } from './ResponsiveDialog.types';
import { Body, Card, FootStart, SheetFoot, Title } from './ResponsiveDialog.styles';

/**
 * L3 widget: a modal with a head, a scrolling body and a footer on desktop,
 * a bottom sheet on phones (≤640px). Escape and a click on the scrim close
 * it. The Add contacts, Edit contact and Use template screens share it.
 */
export function ResponsiveDialog(props: ResponsiveDialogProps): JSX.Element | null {
  const { open, onClose, title, width = 520, footer, footerStart, children } = props;
  const titleId = useId();
  const isMobile = useIsMobileViewport();
  useEscapeKey(onClose, open && !isMobile);

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
