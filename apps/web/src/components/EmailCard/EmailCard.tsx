import { forwardRef } from 'react';
import type { EmailCardProps } from './EmailCard.types';
import { Root } from './EmailCard.styles';

/**
 * L3 widget — the main body card of the transactional email preview. Wraps
 * its children in the surface-colored, bordered, padded shell used by both
 * the "request" and "completed" email variants.
 */
export const EmailCard = forwardRef<HTMLDivElement, EmailCardProps>((props, ref) => {
  const { children, ...rest } = props;
  return (
    <Root ref={ref} {...rest}>
      {children}
    </Root>
  );
});
EmailCard.displayName = 'EmailCard';
