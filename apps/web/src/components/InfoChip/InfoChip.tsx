import { forwardRef } from 'react';
import { Icon } from '../Icon';
import type { InfoChipProps } from './InfoChip.types';
import { InfoChipRoot } from './InfoChip.styles';

/**
 * L1 primitive — read-only fact chip ("Expires May 12", "Reminders on",
 * "2 signers") in a `chips-row` (canvas `.info-chip`).
 */
export const InfoChip = forwardRef<HTMLSpanElement, InfoChipProps>((props, ref) => {
  const { icon, children, ...rest } = props;
  return (
    <InfoChipRoot ref={ref} {...rest}>
      {icon ? <Icon icon={icon} size={14} /> : null}
      {children}
    </InfoChipRoot>
  );
});
InfoChip.displayName = 'InfoChip';
