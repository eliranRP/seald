import { forwardRef } from 'react';
import type { CheckboxProps } from './Checkbox.types';
import { Help, Input, Label, Text } from './Checkbox.styles';

/** L1 checkbox. The whole row is the hit target. */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>((props, ref) => {
  const { label, helpText, checked, onChange, disabled, ...rest } = props;
  return (
    <Label>
      <Input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        {...rest}
      />
      <Text>
        {label}
        {helpText ? <Help>{helpText}</Help> : null}
      </Text>
    </Label>
  );
});
Checkbox.displayName = 'Checkbox';
