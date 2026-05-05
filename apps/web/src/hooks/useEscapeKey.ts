import { useEffect } from 'react';

/**
 * Registers a global `keydown` listener for the Escape key while `enabled` is
 * true. Removes the listener on cleanup or when `enabled` flips to false.
 *
 * Common usage: close a dialog/popover when the user presses Escape.
 *
 * @param handler - Called when Escape is pressed. Wrapped in the effect deps
 *   so a stale closure is never invoked.
 * @param enabled - Guard flag, typically the `open` state of a dialog.
 */
export function useEscapeKey(handler: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled, handler]);
}
