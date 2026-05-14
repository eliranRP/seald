import { forwardRef } from 'react';
import { AuthBrandPanel } from '../AuthBrandPanel';
import { AuthMobileHeader } from './AuthMobileHeader';
import type { AuthShellProps } from './AuthShell.types';
import { FootLinkButton, FootRow, FormSide, FormWrap, Root } from './AuthShell.styles';

/**
 * Split-screen container used by every auth page. Renders the editorial
 * `AuthBrandPanel` on the left (collapsed by its own media query below 960px)
 * and the page's form content on the right, vertically centered and capped at
 * 420px wide.
 *
 * The footer row surfaces the legal/accessibility/security trust links
 * (T-17) plus the cookie-preferences re-opener (T-30). On the production
 * single-domain deploy the legal hrefs all resolve to the landing-served
 * `/legal/*` paths; the preferences button calls into the global
 * `window.SealdConsent` runtime injected by `/scripts/cookie-consent.js`.
 */
export const AuthShell = forwardRef<HTMLDivElement, AuthShellProps>((props, ref) => {
  const { children, compact = false, ...rest } = props;
  const handleManageCookies = (): void => {
    window.SealdConsent?.openBanner();
  };
  return (
    <Root ref={ref} {...rest}>
      {compact ? null : <AuthBrandPanel />}
      <FormSide>
        <FormWrap>
          {compact ? null : <AuthMobileHeader />}
          {children}
        </FormWrap>
        <FootRow aria-label="Legal and accessibility">
          <a href="/legal/privacy">Privacy</a>
          <a href="/legal/terms">Terms</a>
          <a href="/legal/accessibility">Accessibility</a>
          <a href="/legal/responsible-disclosure">Report a vulnerability</a>
          <FootLinkButton
            type="button"
            data-testid="footer-manage-cookies"
            onClick={handleManageCookies}
          >
            Manage cookie preferences
          </FootLinkButton>
        </FootRow>
      </FormSide>
    </Root>
  );
});
AuthShell.displayName = 'AuthShell';
