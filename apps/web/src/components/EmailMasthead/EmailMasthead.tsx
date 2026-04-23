import { forwardRef } from 'react';
import type { EmailMastheadProps } from './EmailMasthead.types';
import { Mark, Root } from './EmailMasthead.styles';

/**
 * L2 domain component — top strip of the transactional email preview.
 * Renders a brand mark (defaults to the first character of `brand`) and the
 * brand name in the serif typeface used by outgoing emails.
 */
export const EmailMasthead = forwardRef<HTMLDivElement, EmailMastheadProps>((props, ref) => {
  const { brand, mark, ...rest } = props;
  return (
    <Root ref={ref} {...rest}>
      <Mark aria-hidden>{mark ?? brand.charAt(0)}</Mark>
      <span>{brand}</span>
    </Root>
  );
});
EmailMasthead.displayName = 'EmailMasthead';
