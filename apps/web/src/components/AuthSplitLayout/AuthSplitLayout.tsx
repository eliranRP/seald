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
          <LogoMark aria-hidden="true">S</LogoMark>
          <span aria-hidden="true">Seald</span>
        </Logo>
        <Body>{children}</Body>
        <FootRow aria-label="Legal and accessibility">
          <a href="/legal/terms">Terms</a>
          <span aria-hidden="true">·</span>
          <a href="/legal/privacy">Privacy</a>
          <span aria-hidden="true">·</span>
          <a href="/legal/accessibility">Accessibility</a>
          <span aria-hidden="true">·</span>
          <a href="/legal/responsible-disclosure">Report a vulnerability</a>
          <span aria-hidden="true">·</span>
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
              <SigField>
                <span>Hannah Wills</span>
              </SigField>
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
