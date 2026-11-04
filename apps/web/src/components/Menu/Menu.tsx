import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { KeyboardEvent, Ref } from 'react';
import { Check } from 'lucide-react';
import { Icon } from '../Icon';
import type {
  MenuActionItem,
  MenuButtonProps,
  MenuCloseReason,
  MenuEntry,
  MenuProps,
} from './Menu.types';
import {
  MenuAnchor,
  MenuCheck,
  MenuHeader,
  MenuItemButton,
  MenuItemLabel,
  MenuLabel,
  MenuSep,
  MenuSurface,
} from './Menu.styles';

/** Gap between anchor and surface; matches `space[1]` in Menu.styles. */
const MENU_GAP_PX = 4;

/**
 * Vertical band the menu can paint in: the intersection of every ancestor
 * that clips overflow (a rounded table card, a scroll area). The viewport is
 * applied by the caller.
 */
function clipBounds(from: Element): { top: number; bottom: number } {
  let top = Number.NEGATIVE_INFINITY;
  let bottom = Number.POSITIVE_INFINITY;
  for (let el = from.parentElement; el && el !== document.body; el = el.parentElement) {
    const { overflowY } = window.getComputedStyle(el);
    if (overflowY === 'visible') continue;
    const r = el.getBoundingClientRect();
    top = Math.max(top, r.top);
    bottom = Math.min(bottom, r.bottom);
  }
  return { top, bottom };
}

function isAction(entry: MenuEntry): entry is MenuActionItem {
  return entry.type === undefined || entry.type === 'item';
}

function enabledItems(root: HTMLElement | null): HTMLButtonElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLButtonElement>('[data-menu-item]:not(:disabled)'));
}

/**
 * L1 primitive — dropdown menu surface (canvas `.menu`). Controlled: the
 * parent owns `open`. Render it inside a `position: relative` box next to
 * its trigger (or use `MenuButton`, which does all of this).
 *
 * Keyboard: ArrowDown / ArrowUp cycle the enabled items, Home / End jump,
 * Escape closes and returns focus to the trigger, Tab closes.
 * Clicks outside the menu and its anchor close it.
 */
export const Menu = forwardRef<HTMLDivElement, MenuProps>((props, ref) => {
  const {
    open,
    onClose,
    items,
    header,
    align = 'end',
    anchorRef,
    autoFocus = true,
    placement = 'auto',
    onKeyDown,
    ...rest
  } = props;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  // `auto` measures on open: when the menu would run past the bottom of the
  // viewport and there is more room above the anchor, it opens upward
  // (forms § 13, flip on edge). Measured before paint, so it never jumps.
  const [flipUp, setFlipUp] = useState(placement === 'top');

  useLayoutEffect(() => {
    if (!open) return;
    if (placement !== 'auto') {
      setFlipUp(placement === 'top');
      return;
    }
    const surface = surfaceRef.current;
    const box = surface?.offsetParent;
    if (!surface || !box) {
      setFlipUp(false);
      return;
    }
    const anchor = box.getBoundingClientRect();
    const need = surface.offsetHeight + MENU_GAP_PX;
    const clip = clipBounds(box);
    const fitsBelow = Math.min(window.innerHeight, clip.bottom) - anchor.bottom >= need;
    const fitsAbove = anchor.top - Math.max(0, clip.top) >= need;
    // Open upward only when it fits there; otherwise stay below, where the
    // page can still scroll the rest into view.
    setFlipUp(!fitsBelow && fitsAbove);
  }, [open, placement, items.length]);

  const setSurface = useCallback(
    (node: HTMLDivElement | null): void => {
      surfaceRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
    },
    [ref],
  );

  const close = useCallback(
    (reason: MenuCloseReason): void => {
      onClose(reason);
      if (reason === 'escape' || reason === 'select') anchorRef?.current?.focus();
    },
    [onClose, anchorRef],
  );

  useEffect(() => {
    if (!open || !autoFocus) return;
    enabledItems(surfaceRef.current)[0]?.focus();
  }, [open, autoFocus]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocMouseDown(event: MouseEvent): void {
      const target = event.target as Node;
      if (surfaceRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose('outside');
    }
    function onDocKeyDown(event: globalThis.KeyboardEvent): void {
      // Escape while focus is outside the menu (e.g. autoFocus off). When
      // focus is inside, the surface handler below stops propagation first.
      if (event.key === 'Escape') close('escape');
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [open, onClose, close, anchorRef]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const list = enabledItems(surfaceRef.current);
    const current = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    switch (event.key) {
      case 'ArrowDown':
        next = list[(current + 1) % list.length];
        break;
      case 'ArrowUp':
        next = list[(current - 1 + list.length) % list.length];
        break;
      case 'Home':
        next = list[0];
        break;
      case 'End':
        next = list[list.length - 1];
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close('escape');
        return;
      case 'Tab':
        close('tab');
        return;
      default:
        return;
    }
    event.preventDefault();
    next?.focus();
  };

  return (
    <MenuSurface
      ref={setSurface}
      role="menu"
      $align={align}
      $up={flipUp}
      data-placement={flipUp ? 'top' : 'bottom'}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {header ? <MenuHeader>{header}</MenuHeader> : null}
      {items.map((entry) => {
        if (entry.type === 'separator') return <MenuSep key={entry.id} role="separator" />;
        if (entry.type === 'label') {
          return (
            <MenuLabel key={entry.id} role="presentation">
              {entry.label}
            </MenuLabel>
          );
        }
        if (!isAction(entry)) return null;
        const isRadio = entry.checked !== undefined;
        const inert = Boolean(entry.disabled || entry.busy);
        return (
          <MenuItemButton
            key={entry.id}
            type="button"
            data-menu-item=""
            role={isRadio ? 'menuitemradio' : 'menuitem'}
            aria-checked={isRadio ? Boolean(entry.checked) : undefined}
            aria-busy={entry.busy || undefined}
            disabled={inert}
            tabIndex={-1}
            $danger={Boolean(entry.danger)}
            $checked={Boolean(entry.checked)}
            onClick={() => {
              if (inert) return;
              entry.onSelect();
              close('select');
            }}
          >
            {entry.icon ? <Icon icon={entry.icon} size={16} /> : null}
            <MenuItemLabel>{entry.label}</MenuItemLabel>
            {entry.checked ? (
              <MenuCheck>
                <Icon icon={Check} size={16} />
              </MenuCheck>
            ) : null}
          </MenuItemButton>
        );
      })}
    </MenuSurface>
  );
});
Menu.displayName = 'Menu';

/**
 * L1 primitive — trigger + Menu with the open state, ARIA wiring
 * (`aria-haspopup`, `aria-expanded`, `aria-controls`) and focus return
 * handled. The trigger is a render prop so any button (icon Button,
 * split-button chevron, avatar) can open a menu.
 */
export function MenuButton(props: MenuButtonProps) {
  const { trigger, onOpenChange, align = 'end', ...menuProps } = props;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  const setOpenState = useCallback(
    (next: boolean): void => {
      setOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  const handleClose = useCallback((): void => setOpenState(false), [setOpenState]);

  return (
    <MenuAnchor>
      {trigger({
        ref: anchorRef as Ref<HTMLButtonElement>,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
        onClick: () => setOpenState(!open),
      })}
      <Menu
        {...menuProps}
        id={menuId}
        open={open}
        onClose={handleClose}
        align={align}
        anchorRef={anchorRef}
      />
    </MenuAnchor>
  );
}
