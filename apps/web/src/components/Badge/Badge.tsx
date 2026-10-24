import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import type { BadgeProps } from './Badge.types';
import { BadgeIcon, BadgeRoot, Dot } from './Badge.styles';

/** L1 primitive — status pill (canvas `.badge`): tone + dot or icon + label. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>((props, ref) => {
  const { tone = 'neutral', dot = true, icon, children, ...rest } = props;
  let lead: ReactNode = null;
  if (icon) {
    lead = (
      <BadgeIcon $tone={tone} data-part="icon">
        <Icon icon={icon} size={12} />
      </BadgeIcon>
    );
  } else if (dot) {
    lead = <Dot data-part="dot" $tone={tone} aria-hidden />;
  }
  return (
    <BadgeRoot ref={ref} $tone={tone} {...rest}>
      {lead}
      <span>{children}</span>
    </BadgeRoot>
  );
});
Badge.displayName = 'Badge';
