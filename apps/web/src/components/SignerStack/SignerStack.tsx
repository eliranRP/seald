import { forwardRef, useCallback, useId, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '../Badge';
import type { BadgeTone } from '../Badge/Badge.types';
import type { SignerStackProps, SignerStackStatus } from './SignerStack.types';
import {
  Avatar,
  Fraction,
  OverflowChip,
  Popover,
  PopoverEmail,
  PopoverMeta,
  PopoverName,
  PopoverRow,
  Root,
  Stack,
} from './SignerStack.styles';

const STATUS_LABEL: Record<SignerStackStatus, string> = {
  signed: 'Signed',
  pending: 'Waiting',
  'awaiting-you': 'Your turn',
  declined: 'Declined',
  draft: 'Not sent',
};

const STATUS_TONE: Record<SignerStackStatus, BadgeTone> = {
  signed: 'emerald',
  pending: 'amber',
  'awaiting-you': 'indigo',
  declined: 'red',
  draft: 'neutral',
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/**
 * Stacked avatar row for a dashboard envelope line. Shows up to
 * `maxVisible` circular avatars with a status-colored ring, a `+N`
 * overflow chip, and a mono signed/total fraction. Hover or focus
 * reveals a popover listing every signer with a status pill.
 */
// Default position when we open before measuring (e.g. SSR / first
// render). Off-screen so it can't flash in the wrong spot if the
// measurement read fails.
const DEFAULT_ANCHOR = { top: -9999, left: -9999 } as const;

export const SignerStack = forwardRef<HTMLDivElement, SignerStackProps>((props, ref) => {
  const { signers, maxVisible = 4, onMouseEnter, onMouseLeave, onFocus, onBlur, ...rest } = props;
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Forward our internal ref so consumers' refs still work.
  useImperativeHandle(ref, () => rootRef.current as HTMLDivElement, []);

  // `open` toggles render; `anchor` carries the viewport-relative
  // coordinates the portaled popover uses. We measure on each show
  // because the anchor position can change between hides (scroll,
  // resize, list reorder) without us getting an event.
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number }>(DEFAULT_ANCHOR);

  const show = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      setAnchor({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen(true);
  }, []);
  const hide = useCallback(() => setOpen(false), []);

  const total = signers.length;
  const signed = signers.filter((s) => s.status === 'signed').length;
  const visible = signers.slice(0, maxVisible);
  const overflow = total - visible.length;

  // The popover is portaled to `document.body` so it can escape any
  // ancestor with `overflow: hidden` (the dashboard's TableShell
  // clipped it before — bug 2026-05-10). We pin it via
  // `position: fixed` + the measured anchor instead of leaning on
  // the trigger's containing block.
  const popoverNode =
    open && total > 0 && typeof document !== 'undefined'
      ? createPortal(
          <Popover
            id={popoverId}
            role="tooltip"
            style={{ position: 'fixed', top: anchor.top, left: anchor.left }}
          >
            {signers.map((s) => (
              <PopoverRow key={s.id}>
                <Avatar as="span" $status={s.status} aria-hidden>
                  {initialsOf(s.name)}
                </Avatar>
                <PopoverMeta>
                  <PopoverName>{s.name}</PopoverName>
                  <PopoverEmail>{s.email}</PopoverEmail>
                </PopoverMeta>
                <Badge tone={STATUS_TONE[s.status]} dot={false}>
                  {STATUS_LABEL[s.status]}
                </Badge>
              </PopoverRow>
            ))}
          </Popover>,
          document.body,
        )
      : null;

  return (
    <Root
      ref={rootRef}
      onMouseEnter={(e) => {
        show();
        onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        hide();
        onMouseLeave?.(e);
      }}
      onFocus={(e) => {
        show();
        onFocus?.(e);
      }}
      onBlur={(e) => {
        hide();
        onBlur?.(e);
      }}
      aria-describedby={open ? popoverId : undefined}
      {...rest}
    >
      <Stack role="list" aria-label={rest['aria-label'] ?? `${total} signers`}>
        {visible.map((s) => (
          <Avatar
            key={s.id}
            $status={s.status}
            role="listitem"
            title={`${s.name} — ${STATUS_LABEL[s.status]}`}
          >
            {initialsOf(s.name)}
          </Avatar>
        ))}
        {overflow > 0 && (
          <OverflowChip aria-label={`${overflow} more signers`}>+{overflow}</OverflowChip>
        )}
      </Stack>
      <Fraction aria-label={`${signed} of ${total} signed`}>
        {signed}/{total} signed
      </Fraction>
      {popoverNode}
    </Root>
  );
});
SignerStack.displayName = 'SignerStack';
