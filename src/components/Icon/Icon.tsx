import { forwardRef } from 'react';
import type { IconProps } from './Icon.types';
import { IconRoot } from './Icon.styles';

export const Icon = forwardRef<HTMLSpanElement, IconProps>((props, ref) => {
  const { icon: IconComponent, size = 20, label, ...rest } = props;
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);
  return (
    <IconRoot ref={ref} $size={size} {...a11y} {...rest}>
      <IconComponent width={size} height={size} strokeWidth={1.75} />
    </IconRoot>
  );
});

Icon.displayName = 'Icon';
