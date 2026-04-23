import { forwardRef } from 'react';
import { AuthBrandPanel } from '../AuthBrandPanel';
import type { AuthShellProps } from './AuthShell.types';
import { FormSide, FormWrap, Root } from './AuthShell.styles';

/**
 * Split-screen container used by every auth page. Renders the editorial
 * `AuthBrandPanel` on the left (collapsed by its own media query below 960px)
 * and the page's form content on the right, vertically centered and capped at
 * 420px wide.
 */
export const AuthShell = forwardRef<HTMLDivElement, AuthShellProps>((props, ref) => {
  const { children, compact = false, ...rest } = props;
  return (
    <Root ref={ref} {...rest}>
      {compact ? null : <AuthBrandPanel />}
      <FormSide>
        <FormWrap>{children}</FormWrap>
      </FormSide>
    </Root>
  );
});
AuthShell.displayName = 'AuthShell';
