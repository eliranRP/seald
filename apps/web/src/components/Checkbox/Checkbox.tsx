import { forwardRef, useId } from 'react';
import { Hint, Input, LabelText, Root, Text } from './Checkbox.styles';
import type { CheckboxProps } from './Checkbox.types';

/**
 * Labelled native checkbox. The 44px row is the tap target; the input keeps
 * its native semantics so role "checkbox" and the accessible name come free.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>((props, ref) => {
  const { checked, onChange, label, hint, disabled = false, ...rest } = props;
  const hintId = useId();
  const labelId = useId();
  return (
    <Root $disabled={disabled}>
      <Input
        {...rest}
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
      />
      <Text>
        <LabelText id={labelId}>{label}</LabelText>
        {hint ? <Hint id={hintId}>{hint}</Hint> : null}
      </Text>
    </Root>
  );
});

Checkbox.displayName = 'Checkbox';
