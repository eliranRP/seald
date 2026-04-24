import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Info, Loader2 } from 'lucide-react';
import type { DownloadMenuProps } from './DownloadMenu.types';
import {
  ChevronButton,
  Footer,
  FooterIcon,
  Item,
  ItemBody,
  ItemDesc,
  ItemIcon,
  ItemIconSpinning,
  ItemMeta,
  ItemTitle,
  ItemTitleRow,
  LockedPill,
  Menu,
  MenuHeading,
  RecommendedPill,
  Root,
  SplitButton,
  SplitIcon,
} from './DownloadMenu.styles';

/**
 * L3 component — split-button dropdown matching the design-kit spec
 * (`Design-Guide/project/ui_kits/dashboard/EnvelopeDetail.jsx`
 * `DownloadMenu`). The left half fires the recommended (or first
 * available) artifact directly; the right half opens a 360px menu
 * showing every artifact with its icon tile, title, description, and
 * mono meta line.
 *
 * Unavailable rows surface a LOCKED pill and render disabled.
 * The recommended row's icon tile lights up indigo and a RECOMMENDED
 * pill sits next to the title.
 *
 * Closes on outside click + Escape + after a pick.
 */
export const DownloadMenu = forwardRef<HTMLDivElement, DownloadMenuProps>(
  function DownloadMenu(props, ref) {
    const { items, onSelect, inFlight = null, disabled = false, ...rest } = props;

    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return undefined;
      function onDocClick(ev: MouseEvent): void {
        if (!rootRef.current) return;
        if (!rootRef.current.contains(ev.target as Node)) setOpen(false);
      }
      function onKey(ev: KeyboardEvent): void {
        if (ev.key === 'Escape') setOpen(false);
      }
      document.addEventListener('mousedown', onDocClick);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDocClick);
        document.removeEventListener('keydown', onKey);
      };
    }, [open]);

    // Forward external ref to the wrapper while keeping the internal ref
    // for outside-click detection.
    const setRoot = useCallback(
      (node: HTMLDivElement | null): void => {
        (rootRef as { current: HTMLDivElement | null }).current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as { current: HTMLDivElement | null }).current = node;
        }
      },
      [ref],
    );

    // The primary action is the first recommended row, falling back to
    // the first available one, falling back to the first row.
    const primary = useMemo(() => {
      const recommended = items.find((i) => i.recommended === true && i.available);
      if (recommended) return recommended;
      const firstAvailable = items.find((i) => i.available);
      return firstAvailable ?? items[0];
    }, [items]);

    const primaryLabel = primary
      ? `Download ${primary.primaryLabel ?? primary.title.toLowerCase()}`
      : 'Download';

    const pick = useCallback(
      (kind: string) => {
        setOpen(false);
        onSelect(kind);
      },
      [onSelect],
    );

    return (
      <Root ref={setRoot} {...rest}>
        <SplitButton
          type="button"
          onClick={() => primary && pick(primary.kind)}
          disabled={disabled || primary === undefined || !primary.available}
          title={primary ? primaryLabel : 'No artifacts available yet'}
        >
          <SplitIcon
            $spinning={inFlight !== null && primary !== undefined && inFlight === primary.kind}
          >
            {inFlight !== null && primary !== undefined && inFlight === primary.kind ? (
              <Loader2 size={14} aria-hidden />
            ) : (
              <Download size={14} aria-hidden />
            )}
          </SplitIcon>
          {primaryLabel}
        </SplitButton>
        <ChevronButton
          type="button"
          $open={open}
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Show all download options"
        >
          <ChevronDown size={14} aria-hidden />
        </ChevronButton>

        {open ? (
          <Menu role="menu" aria-label="Download options">
            <MenuHeading>Download</MenuHeading>
            {items.map((it) => {
              const Icon = it.icon;
              const isDisabled = !it.available;
              const isLoading = inFlight === it.kind;
              return (
                <Item
                  key={it.kind}
                  type="button"
                  role="menuitem"
                  $active={isLoading}
                  data-active={isLoading ? 'true' : 'false'}
                  aria-disabled={isDisabled}
                  disabled={isDisabled}
                  onClick={() => {
                    if (!isDisabled) pick(it.kind);
                  }}
                >
                  <ItemIcon $recommended={it.recommended === true}>
                    {isLoading ? (
                      <ItemIconSpinning>
                        <Loader2 size={16} aria-hidden />
                      </ItemIconSpinning>
                    ) : (
                      <Icon size={16} aria-hidden />
                    )}
                  </ItemIcon>
                  <ItemBody>
                    <ItemTitleRow>
                      <ItemTitle>{it.title}</ItemTitle>
                      {it.recommended === true && it.available ? (
                        <RecommendedPill>RECOMMENDED</RecommendedPill>
                      ) : null}
                      {isDisabled ? <LockedPill>LOCKED</LockedPill> : null}
                    </ItemTitleRow>
                    <ItemDesc>{it.description}</ItemDesc>
                    <ItemMeta>{isLoading ? 'Preparing…' : it.meta}</ItemMeta>
                  </ItemBody>
                </Item>
              );
            })}
            <Footer>
              <FooterIcon>
                <Info size={12} aria-hidden />
              </FooterIcon>
              <span>
                All downloads include SHA-256 verification. The audit trail can be independently
                verified using the envelope reference code.
              </span>
            </Footer>
          </Menu>
        ) : null}
      </Root>
    );
  },
);
DownloadMenu.displayName = 'DownloadMenu';
