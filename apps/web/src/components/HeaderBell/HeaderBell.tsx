import { Bell } from 'lucide-react';
import { Icon } from '../Icon';
import { Badge, Root } from './HeaderBell.styles';
import type { HeaderBellProps } from './HeaderBell.types';

const MAX_SHOWN = 99;

/** Header bell button with a pending-count badge. */
export function HeaderBell({ count, onClick }: HeaderBellProps) {
  const safe = Math.max(0, Math.floor(count));
  const name = safe === 0 ? 'Notifications' : `Notifications, ${safe} pending`;
  return (
    <Root type="button" aria-label={name} onClick={onClick}>
      <Icon icon={Bell} size={20} />
      {safe > 0 ? <Badge aria-hidden>{safe > MAX_SHOWN ? `${MAX_SHOWN}+` : safe}</Badge> : null}
    </Root>
  );
}
