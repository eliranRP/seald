import { forwardRef } from 'react';
import type { DividerProps } from './Divider.types';
import { DividerRoot, Rule, Label } from './Divider.styles';

export const Divider = forwardRef<HTMLDivElement, DividerProps>((props, ref) => {
  const { label, role, ...rest } = props;

  if (label === undefined) {
    return (
      <DividerRoot ref={ref} role={role ?? 'separator'} {...rest}>
        <Rule aria-hidden />
      </DividerRoot>
    );
  }

  return (
    <DividerRoot ref={ref} role={role ?? 'separator'} aria-label={label} {...rest}>
      <Rule aria-hidden />
      <Label>{label}</Label>
      <Rule aria-hidden />
    </DividerRoot>
  );
});

Divider.displayName = 'Divider';
