import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

/** Open modals, innermost last: only the top one handles Tab. */
const stack: RefObject<HTMLElement | null>[] = [];

function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * Modal focus contract (UX rules: visual-system-and-accessibility § 8):
 * while `active`, Tab and Shift+Tab cycle inside `containerRef`, and on
 * close focus goes back to whatever had it when the modal opened (usually
 * the trigger). Initial focus stays with the caller, which knows whether
 * the surface, a `data-autofocus` child or the first field should get it.
 */
export function useModalFocus(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The modal node mounted with this open; captured so cleanup can still
    // tell whether focus sat inside it after React detached the ref.
    const root = containerRef.current;
    stack.push(containerRef);

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab' || stack[stack.length - 1] !== containerRef) return;
      if (!root) return;
      const items = tabbables(root);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        root.focus();
        return;
      }
      const current = document.activeElement;
      const inside = current instanceof Node && root.contains(current);
      if (event.shiftKey && (!inside || current === first || current === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || current === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const at = stack.lastIndexOf(containerRef);
      if (at !== -1) stack.splice(at, 1);
      // Hand focus back only if it is still inside the closing modal (or
      // was dropped on <body> by the unmount); never steal it from
      // somewhere the user has moved on to.
      const now = document.activeElement;
      const lost = now === null || now === document.body || Boolean(root?.contains(now));
      if (lost && opener?.isConnected) opener.focus();
    };
  }, [active, containerRef]);
}
