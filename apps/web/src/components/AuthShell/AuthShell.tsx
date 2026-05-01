import { forwardRef } from 'react';
import { AuthBrandPanel } from '../AuthBrandPanel';
import type { AuthShellProps } from './AuthShell.types';
import { FootRow, FormSide, FormWrap, Root } from './AuthShell.styles';

/**
 * Split-screen container used by every auth page. Renders the editorial
 * `AuthBrandPanel` on the left (collapsed by its own media query below 960px)
 * and the page's form content on the right, vertically centered and capped at
 * 420px wide.
 *
 * The footer row surfaces the legal/accessibility/security trust links
 * (T-17). On the production single-domain deploy these all resolve to
 * the landing-served `/legal/*` and `/.well-known/security.txt` paths.
 */
export const AuthShell = forwardRef<HTMLDivElement, AuthShellProps>((props, ref) => {
  const { children, compact = false, ...rest } = props;
  return (
    <Root ref={ref} {...rest}>
      {compact ? null : <AuthBrandPanel />}
      <FormSide>
        <FormWrap>{children}</FormWrap>
        <FootRow aria-label="Legal and accessibility">
          <a href="/legal/privacy">Privacy</a>
          <a href="/legal/terms">Terms</a>
          <a href="/legal/accessibility">Accessibility</a>
          <a href="/legal/responsible-disclosure">Report a vulnerability</a>
        </FootRow>
      </FormSide>
    </Root>
  );
});
AuthShell.displayName = 'AuthShell';
