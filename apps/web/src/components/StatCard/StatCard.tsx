import { forwardRef } from 'react';
import type { StatCardProps } from './StatCard.types';
import { InteractiveRoot, Label, Root, Value } from './StatCard.styles';

/**
 * L1 primitive — displays a single KPI tile with a muted label above a large
 * tone-colored value. Used in the dashboard stat grid.
 *
 * Pass `onActivate` to make the tile a real `<button>` that toggles a
 * filter; `active` paints the pressed state.
 */
export const StatCard = forwardRef<HTMLDivElement, StatCardProps>((props, ref) => {
  const { label, value, tone, onActivate, active, ...rest } = props;
  const body = (
    <>
      <Label>{label}</Label>
      <Value $tone={tone}>{value}</Value>
    </>
  );
  if (onActivate) {
    // The div ref + `...rest` (typed for a div) aren't forwarded here —
    // no consumer needs either on an interactive tile, and forwarding
    // div-typed handlers onto a <button> doesn't type-check.
    return (
      <InteractiveRoot type="button" aria-pressed={active ?? false} onClick={onActivate}>
        {body}
      </InteractiveRoot>
    );
  }
  return (
    <Root ref={ref} {...rest}>
      {body}
    </Root>
  );
});
StatCard.displayName = 'StatCard';
