import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import {
  ChipButton,
  ChipLabel,
  ChipValue,
  PopoverCard,
  ChipClearButton,
} from './FilterToolbar.styles';

export interface FilterChipPopoverProps {
  /** Static label rendered in the trigger ("Status", "Date", etc.). */
  readonly label: string;
  /**
   * Compact value preview rendered after the label (e.g. "Awaiting
   * you, +1"). Empty string means no filter is active and the chip
   * sits in its neutral state.
   */
  readonly value: string;
  /** Renders the chip with the active accent treatment. */
  readonly active: boolean;
  /**
   * Optional clear handler. When provided AND the chip is active, an
   * inline ✕ button appears that calls this without opening the
   * popover. Lets the user reset a single filter without first
   * dismissing the popover.
   */
  readonly onClear?: () => void;
  /** Popover body. Re-rendered each open; keep state owned upstream. */
  readonly children: ReactNode;
}

/**
 * Shared shell for every dashboard filter chip. Opens on click and on
 * keyboard activation; the popover content portals to `document.body`
 * so it escapes any `overflow: hidden` ancestor (the dashboard's
 * TableShell crops the table area — same constraint that bit
 * SignerStack in PR #225).
 *
 * The chip's open/closed state lives here. Filter state itself
 * (selected statuses, date range, etc.) lives in the URL via the
 * caller; the popover body is just a controlled UI for it.
 */
export const FilterChipPopover = forwardRef<HTMLButtonElement, FilterChipPopoverProps>(
  (props, ref) => {
    const { label, value, active, onClear, children } = props;
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement, []);
    const [open, setOpen] = useState(false);
    const [anchor, setAnchor] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    const reposition = useCallback(() => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.bottom + 6, left: rect.left });
    }, []);

    const openPopover = useCallback(() => {
      reposition();
      setOpen(true);
    }, [reposition]);

    // Outside-click / Escape dismiss while the popover is open. We
    // listen on `document` and only attach the handlers when open so
    // we don't hold them open for every chip on the page.
    useEffect(() => {
      if (!open) return undefined;
      function onDocPointer(e: MouseEvent) {
        const target = e.target as Node;
        const trigger = triggerRef.current;
        if (trigger && trigger.contains(target)) return;
        if ((target as HTMLElement | null)?.closest?.('[data-filter-chip-popover]')) return;
        setOpen(false);
      }
      function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') setOpen(false);
      }
      function onScrollOrResize() {
        // Update anchor so the popover stays glued to the trigger as
        // the user scrolls the dashboard or resizes the window.
        reposition();
      }
      document.addEventListener('mousedown', onDocPointer);
      document.addEventListener('keydown', onKey);
      window.addEventListener('scroll', onScrollOrResize, true);
      window.addEventListener('resize', onScrollOrResize);
      return () => {
        document.removeEventListener('mousedown', onDocPointer);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('scroll', onScrollOrResize, true);
        window.removeEventListener('resize', onScrollOrResize);
      };
    }, [open, reposition]);

    const popoverStyle: CSSProperties = {
      position: 'fixed',
      top: anchor.top,
      left: anchor.left,
    };

    return (
      <>
        <ChipButton
          ref={triggerRef}
          type="button"
          onClick={openPopover}
          $active={active}
          aria-label={`${label} filter`}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <ChipLabel>{label}</ChipLabel>
          {value !== '' ? <ChipValue>{value}</ChipValue> : null}
          <ChevronDown size={14} aria-hidden />
          {active && onClear ? (
            <ChipClearButton
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              aria-label={`Clear ${label} filter`}
            >
              <X size={12} aria-hidden />
            </ChipClearButton>
          ) : null}
        </ChipButton>
        {open && typeof document !== 'undefined'
          ? createPortal(
              <PopoverCard
                role="dialog"
                aria-label={`${label} filter`}
                data-filter-chip-popover
                style={popoverStyle}
              >
                {children}
              </PopoverCard>,
              document.body,
            )
          : null}
      </>
    );
  },
);
FilterChipPopover.displayName = 'FilterChipPopover';
