import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface UseFocusTrapOptions {
  readonly enabled: boolean;
  /** Focus this node after open. Omit to leave focus where it is. */
  readonly initialFocusRef?: RefObject<HTMLElement | null> | undefined;
  readonly onEscape?: (() => void) | undefined;
}

/**
 * Tab cycle, optional Escape, and focus return for a dialog.
 * Lifted from DisconnectModal so every dialog can share one trap.
 * The trigger is read in layout, before this hook moves focus inside.
 */
export function useFocusTrap<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  options: UseFocusTrapOptions,
): { readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void } {
  const { enabled, initialFocusRef, onEscape } = options;
  const previous = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const active = document.activeElement;
    const container = containerRef.current;
    if (active instanceof HTMLElement && (!container || !container.contains(active))) {
      previous.current = active;
    }
    initialFocusRef?.current?.focus();
    return () => {
      const back = previous.current;
      previous.current = null;
      if (back && document.contains(back)) back.focus();
    };
  }, [enabled, containerRef, initialFocusRef]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') return;
    const container = containerRef.current;
    if (!container) return;
    const focusables = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first === undefined || last === undefined) return;
    const active = document.activeElement as HTMLElement | null;
    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { onKeyDown };
}
