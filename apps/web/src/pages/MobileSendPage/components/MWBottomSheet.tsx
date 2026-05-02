import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { SheetBackdrop, SheetGrabber, SheetSurface, SheetTitle } from '../MobileSendPage.styles';

const FOCUSABLE_SELECTOR =
  'input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface MWBottomSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: string;
  readonly children: ReactNode;
  readonly labelledBy?: string;
}

/**
 * Modal bottom sheet rising from the bottom of the viewport. ESC + tap-on-
 * backdrop close. The surface stops bubbling so taps inside the sheet don't
 * reach the backdrop. Body scroll is locked while open so the page underneath
 * doesn't drift on iOS rubber-banding.
 */
export function MWBottomSheet(props: MWBottomSheetProps) {
  const { open, onClose, title, children, labelledBy } = props;
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  // ESC dismiss
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // QA-2026-05-02 (Bug 7): when the sheet opens, move focus to its first
  // interactive element (input first, otherwise the first button) so
  // keyboard users can act immediately without an extra tab. We defer
  // by a microtask so the DOM is mounted; an explicit `data-autofocus`
  // attribute on a child wins over the default first-focusable.
  useEffect(() => {
    if (!open) return;
    const surface = surfaceRef.current;
    if (!surface) return;
    const explicit = surface.querySelector<HTMLElement>('[data-autofocus]');
    if (explicit) {
      explicit.focus();
      return;
    }
    const focusables = surface.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first =
      Array.from(focusables).find((el) => el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ??
      focusables[0];
    first?.focus();
  }, [open]);

  if (!open) return null;
  const titleId =
    labelledBy ?? (title ? `mw-sheet-title-${title.replace(/\s+/g, '-')}` : undefined);
  return (
    <SheetBackdrop role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={onClose}>
      <SheetSurface
        ref={surfaceRef}
        onClick={(e) => e.stopPropagation()}
        // Stop pointer-down too — the place-step's drag handler captures
        // pointerdown on its canvas; without this an unintentional drag
        // could begin while a sheet is open.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <SheetGrabber aria-hidden />
        {title && <SheetTitle id={titleId}>{title}</SheetTitle>}
        {children}
      </SheetSurface>
    </SheetBackdrop>
  );
}
