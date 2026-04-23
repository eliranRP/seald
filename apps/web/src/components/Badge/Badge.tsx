import { forwardRef } from 'react';
import type { BadgeProps } from './Badge.types';
import { BadgeRoot, Dot } from './Badge.styles';

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>((props, ref) => {
  const { tone = 'neutral', dot = true, children, ...rest } = props;
  return (
    <BadgeRoot ref={ref} $tone={tone} {...rest}>
      {dot ? <Dot data-part="dot" $tone={tone} aria-hidden /> : null}
      <span>{children}</span>
    </BadgeRoot>
  );
});
Badge.displayName = 'Badge';
