import { forwardRef } from 'react';
import { Icon } from '../Icon';
import type { EmptyStateProps } from './EmptyState.types';
import { Action, Art, Root, Text, Title } from './EmptyState.styles';

/**
 * L1 primitive — empty list / table placeholder (canvas `.empty`):
 * icon art + serif title + one action. Children render as a short muted
 * line, which keeps the original text-only usage working.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>((props, ref) => {
  const { icon, title, action, children, ...rest } = props;
  return (
    <Root ref={ref} {...rest}>
      {icon ? (
        <Art aria-hidden>
          <Icon icon={icon} size={32} />
        </Art>
      ) : null}
      {title ? <Title>{title}</Title> : null}
      {children ? <Text>{children}</Text> : null}
      {action ? <Action>{action}</Action> : null}
    </Root>
  );
});
EmptyState.displayName = 'EmptyState';
