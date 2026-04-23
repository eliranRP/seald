import { forwardRef } from 'react';
import type { EmptyStateProps } from './EmptyState.types';
import { Root } from './EmptyState.styles';

/**
 * L1 primitive — centered muted-text placeholder shown when a list / table has
 * no items to display.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>((props, ref) => {
  const { children, ...rest } = props;
  return (
    <Root ref={ref} {...rest}>
      {children}
    </Root>
  );
});
EmptyState.displayName = 'EmptyState';
