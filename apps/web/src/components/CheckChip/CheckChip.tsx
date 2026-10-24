import { forwardRef } from 'react';
import { Check, Minus, X } from 'lucide-react';
import { Icon } from '../Icon';
import type { CheckChipProps, CheckChipState } from './CheckChip.types';
import { CheckChipRoot, HiddenState } from './CheckChip.styles';

const GLYPH = { ok: Check, bad: X, off: Minus } as const;
const STATE_LABEL: Record<CheckChipState, string> = {
  ok: 'passed',
  bad: 'failed',
  off: 'not checked',
};

/**
 * L1 primitive — pass / fail check chip (canvas `.check-chip`), used by the
 * verify verdict ("Signature valid", "Timestamp", "Not tampered").
 * The state is spelled out for screen readers, not carried by colour alone.
 */
export const CheckChip = forwardRef<HTMLSpanElement, CheckChipProps>((props, ref) => {
  const { state = 'ok', index = 0, children, ...rest } = props;
  return (
    <CheckChipRoot ref={ref} $state={state} $index={index} data-state={state} {...rest}>
      <Icon icon={GLYPH[state]} size={16} />
      {children}
      <HiddenState>{` (${STATE_LABEL[state]})`}</HiddenState>
    </CheckChipRoot>
  );
});
CheckChip.displayName = 'CheckChip';
