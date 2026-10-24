import { forwardRef } from 'react';
import { PenLine, ShieldCheck, Users } from 'lucide-react';
import { CheckChip } from '../CheckChip';
import { Icon } from '../Icon';
import type { AuthSplitLayoutProps } from './AuthSplitLayout.types';
import {
  Benefit,
  BenefitIcon,
  Benefits,
  Body,
  FootLinkButton,
  FootRow,
  Logo,
  LogoMark,
  Main,
  Panel,
  Paper,
  PaperHead,
  PaperLine,
  PaperStage,
  Root,
  SigField,
} from './AuthSplitLayout.styles';

const BENEFITS = [
  { id: 'fast', icon: PenLine, label: 'Sign in 1 minute' },
  { id: 'sealed', icon: ShieldCheck, label: 'Sealed + tamper-proof' },
  { id: 'track', icon: Users, label: 'Track every signer' },
] as const;

/**
 * L2 layout shared by every auth surface (sign in / create account, check
 * email, welcome). Form column on the left, a calm product visual on the
 * right; the visual disappears under 768 px so phones get the form only.
 *
 * The footer carries the legal / accessibility / security trust links plus
 * the cookie-preferences re-opener (calls the global `window.SealdConsent`
 * runtime injected by `/scripts/cookie-consent.js`).
 */
export const AuthSplitLayout = forwardRef<HTMLDivElement, AuthSplitLayoutProps>((props, ref) => {
  const { children, hidePanel = false, ...rest } = props;
  const handleManageCookies = (): void => {
    window.SealdConsent?.openBanner();
  };
  return (
    <Root ref={ref} $panel={!hidePanel} {...rest}>
      <Main>
        <Logo href="/" aria-label="Seald home">
          <LogoMark aria-hidden="true">
            <svg viewBox="0 0 40 40" width="16" height="16" fill="none" aria-hidden="true">
              <g transform="translate(6, 6)">
                <path
                  d="M2 22 C 6 20, 10 14, 14 12 L 22 4 L 26 8 L 18 16 C 16 20, 10 24, 4 26 Z"
                  fill="currentColor"
                />
                <path
                  d="M22 4 L 24 2 C 25 1, 26.5 1, 27.5 2 L 28 2.5 C 29 3.5, 29 5, 28 6 L 26 8 Z"
                  fill="currentColor"
                  opacity="0.7"
                />
              </g>
            </svg>
          </LogoMark>
          <span aria-hidden="true">Seald</span>
        </Logo>
        <Body>{children}</Body>
        <FootRow aria-label="Legal and accessibility">
          <a href="/legal/terms">Terms</a>
          <a href="/legal/privacy">Privacy</a>
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
      </Main>
      {hidePanel ? null : (
        <Panel>
          <PaperStage aria-hidden="true">
            <Paper>
              <PaperHead>
                <span>NDA — Quill Capital</span>
                <CheckChip state="ok">Sealed</CheckChip>
              </PaperHead>
              <PaperLine $w="100%" />
              <PaperLine $w="92%" />
              <PaperLine $w="97%" />
              <PaperLine $w="64%" />
              <SigField>Hannah Wills</SigField>
              <PaperLine $w="100%" />
              <PaperLine $w="88%" />
            </Paper>
          </PaperStage>
          <Benefits>
            {BENEFITS.map((b) => (
              <Benefit key={b.id}>
                <BenefitIcon>
                  <Icon icon={b.icon} size={20} />
                </BenefitIcon>
                {b.label}
              </Benefit>
            ))}
          </Benefits>
        </Panel>
      )}
    </Root>
  );
});
AuthSplitLayout.displayName = 'AuthSplitLayout';
