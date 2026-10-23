import { Input, Root } from './Switch.styles';
import type { SwitchProps } from './Switch.types';

/**
 * An on/off switch (`role="switch"`) with a 44px tap target. The caller
 * shows the visible text; `label` is the accessible name.
 */
export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
  pending = false,
}: SwitchProps) {
  const locked = disabled || pending;
  return (
    <Root>
      <Input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        onChange={(event) => {
          if (locked) return;
          onChange(event.currentTarget.checked);
        }}
      />
    </Root>
  );
}
