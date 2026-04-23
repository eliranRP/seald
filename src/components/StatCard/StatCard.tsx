import { forwardRef } from 'react';
import type { StatCardProps } from './StatCard.types';
import { Label, Root, Value } from './StatCard.styles';

/**
 * L1 primitive — displays a single KPI tile with a muted label above a large
 * tone-colored value. Used in the dashboard stat grid.
 */
export const StatCard = forwardRef<HTMLDivElement, StatCardProps>((props, ref) => {
  const { label, value, tone, ...rest } = props;
  return (
    <Root ref={ref} {...rest}>
      <Label>{label}</Label>
      <Value $tone={tone}>{value}</Value>
    </Root>
  );
});
StatCard.displayName = 'StatCard';
