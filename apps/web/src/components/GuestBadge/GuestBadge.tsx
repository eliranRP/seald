import { forwardRef } from 'react';
import { User as UserIcon } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Icon } from '../Icon';
import type { GuestBadgeProps } from './GuestBadge.types';
import { BadgeRoot } from './GuestBadge.styles';

export const GuestBadge = forwardRef<HTMLSpanElement, GuestBadgeProps>((props, ref) => {
  const t = useT();
  const { label = t('guestBadge.label'), ...rest } = props;
  return (
    <BadgeRoot ref={ref} {...rest}>
      <Icon icon={UserIcon} size={12} />
      <span>{label}</span>
    </BadgeRoot>
  );
});

GuestBadge.displayName = 'GuestBadge';
