import { forwardRef, useState, useCallback, useId } from 'react';
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
export const SignerStack = forwardRef<HTMLDivElement, SignerStackProps>((props, ref) => {
  const { signers, maxVisible = 4, onMouseEnter, onMouseLeave, onFocus, onBlur, ...rest } = props;
  const popoverId = useId();
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);

  const total = signers.length;
  const signed = signers.filter((s) => s.status === 'signed').length;
  const visible = signers.slice(0, maxVisible);
  const overflow = total - visible.length;

  return (
    <Root
      ref={ref}
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
      {open && total > 0 && (
        <Popover id={popoverId} role="tooltip">
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
        </Popover>
      )}
    </Root>
  );
});
SignerStack.displayName = 'SignerStack';
