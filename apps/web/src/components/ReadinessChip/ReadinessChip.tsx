import { forwardRef } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ReadinessChipProps } from './ReadinessChip.types';
import { Chip, Text } from './ReadinessChip.styles';

/**
 * Header chip that answers "can I send yet?": a green "Ready" or an amber
 * "N issues" button that opens the list of fixes.
 */
export const ReadinessChip = forwardRef<HTMLButtonElement, ReadinessChipProps>((props, ref) => {
  const { issues, expanded, ...rest } = props;
  const ok = issues === 0;
  const label = ok ? 'Ready' : `${String(issues)} ${issues === 1 ? 'issue' : 'issues'}`;
  return (
    <Chip
      {...rest}
      ref={ref}
      type="button"
      $ok={ok}
      {...(ok ? {} : { 'aria-haspopup': 'menu' as const, 'aria-expanded': expanded === true })}
    >
      {ok ? (
        <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
      ) : (
        <AlertCircle size={16} strokeWidth={2} aria-hidden />
      )}
      <Text>{label}</Text>
    </Chip>
  );
});

ReadinessChip.displayName = 'ReadinessChip';
