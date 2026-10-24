import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/Button';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { Body, Foot, Head, Heading, Scrim, Surface } from './SheetDialog.styles';
import type { SheetDialogProps } from './SheetDialog.types';

/**
 * Dialog that is a centred modal on a desktop and a bottom sheet on a phone.
 * Scrim click and Escape close it; focus moves into it on open.
 */
export function SheetDialog(props: SheetDialogProps) {
  const {
    open,
    onClose,
    title,
    showTitle = true,
    closeLabel = 'Close',
    width = 520,
    children,
    footer,
  } = props;
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  useEscapeKey(onClose, open);

  useEffect(() => {
    if (!open) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const explicit = surface.querySelector<HTMLElement>('[data-autofocus]');
    (explicit ?? surface).focus();
  }, [open]);

  if (!open) return null;

  return (
    <Scrim onClick={onClose}>
      <Surface
        ref={surfaceRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        $width={width}
        onClick={(e) => e.stopPropagation()}
      >
        {showTitle ? (
          <Head>
            <Heading>{title}</Heading>
            <Button
              variant="ghost"
              iconOnly
              iconLeft={X}
              aria-label={closeLabel}
              onClick={onClose}
            />
          </Head>
        ) : null}
        <Body>{children}</Body>
        {footer ? <Foot>{footer}</Foot> : null}
      </Surface>
    </Scrim>
  );
}
