import { useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isFeatureEnabled } from 'shared';
import styled from 'styled-components';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { MobileNav } from '../components/MobileNav';
import { NavBar } from '../components/NavBar';
import { OfflineBar } from '../components/OfflineBar';
import { screenEnter } from '@/styles/motion';
import { useAppState } from '../providers/AppStateProvider';
import { useAuth } from '../providers/AuthProvider';
import { useAccountActions } from '@/features/account';
import { ApprovalsBell, isApprovalsEnabled } from '@/features/approvals';
import { useGDriveOAuthMessageListener } from '@/routes/settings/integrations/useGDriveAccounts';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';
import { MOBILE_NAV_ITEMS, NAV_ITEMS, NEW_DOCUMENT_PATH, matchNavId } from './navItems';
import { isMobileNavExempt } from './mobileNavExempt';
import { SystemOverlays } from './SystemOverlays';

/** Help entry in the top bar (no help centre yet — mail support). */
const HELP_HREF = 'mailto:support@seald.nromomentum.com';

const DESKTOP_NAV_ITEMS = NAV_ITEMS.map((item) => ({
  id: item.id,
  label: item.label,
  icon: item.icon,
  href: item.path,
}));

const MOBILE_ITEMS = MOBILE_NAV_ITEMS.map((item) => ({
  id: item.id,
  label: item.label,
  icon: item.icon,
  href: item.path,
}));

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const Content = styled.main`
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  /* Shell caps height to 100vh with overflow:hidden, so Content owns the
     scroll. Pages that overflow (SentConfirmation audit list, UseTemplate
     Signers step with picker open) scroll naturally; pages with their
     own inner scroll (DocumentPage canvas, signing flows) are unaffected. */
  overflow-y: auto;
  /* Re-keyed per pathname (see AppShell) so every navigation replays the
     v2 screen-enter motion on the main column. */
  ${screenEnter}
`;

/**
 * Issue #39 — the legal trust links plus the cookie-preferences re-opener
 * MUST be reachable from every authed surface, not just the AuthShell
 * (sign-in / sign-up). EDPB 03/2022 + CCPA §7026(a)(4): consent
 * withdrawal must be "as easy as" giving consent. Kept visually quiet
 * (small text, neutral color) so it never competes with page chrome.
 */
const ShellFooter = styled.footer`
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  align-items: center;
  justify-content: center;
  padding: 14px 24px;
  border-top: 1px solid ${({ theme }) => theme.color.border[2]};
  background: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};

  a,
  button {
    color: inherit;
    font-size: inherit;
    text-decoration: none;
  }

  a:hover,
  button:hover {
    color: ${({ theme }) => theme.color.fg[1]};
  }

  a:focus-visible,
  button:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
    border-radius: 2px;
  }
`;

const ShellFooterButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  cursor: pointer;
`;

function ShellLegalFooter() {
  const handleManageCookies = (): void => {
    window.SealdConsent?.openBanner();
  };
  return (
    <ShellFooter aria-label="Legal and cookie preferences">
      <a href="/legal/privacy">Privacy</a>
      <a href="/legal/terms">Terms</a>
      <a href="/legal/cookies">Cookies</a>
      <a href="/legal/accessibility">Accessibility</a>
      <ShellFooterButton
        type="button"
        data-testid="footer-manage-cookies"
        onClick={handleManageCookies}
      >
        Manage cookie preferences
      </ShellFooterButton>
    </ShellFooter>
  );
}

/**
 * L4 layout — wraps routed pages with the shared NavBar. The NavBar's `mode`
 * follows auth state: `authed` for signed-in users, `guest` for anonymous
 * visitors who chose "Skip". Anonymous-without-skip never reach this shell
 * (they're bounced by `RequireAuth` / `RequireAuthOrGuest` upstream).
 */
export function AppShell() {
  const { user } = useAppState();
  const { guest, exitGuestMode, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeNavId = matchNavId(location.pathname);
  const isMobile = useIsMobileViewport();

  const handleSelectNavItem = useCallback(
    (id: string): void => {
      const item = NAV_ITEMS.find((n) => n.id === id);
      if (item) navigate(item.path);
    },
    [navigate],
  );

  const handleMobileNavigate = useCallback(
    (_id: string, href: string): void => {
      navigate(href);
    },
    [navigate],
  );

  const handleNewDocument = useCallback((): void => {
    navigate(NEW_DOCUMENT_PATH);
  }, [navigate]);

  const handleOpenSettings = useCallback((): void => {
    navigate('/settings');
  }, [navigate]);

  const handleSignIn = useCallback((): void => {
    exitGuestMode();
    navigate('/signin');
  }, [exitGuestMode, navigate]);

  const handleSignUp = useCallback((): void => {
    exitGuestMode();
    navigate('/signup');
  }, [exitGuestMode, navigate]);

  const handleSignOut = useCallback((): void => {
    signOut()
      .catch(() => {
        /* already surfaced via AuthProvider state; user lands on /signin via RequireAuth */
      })
      .finally(() => navigate('/signin', { replace: true }));
  }, [signOut, navigate]);

  // After successful account deletion the Supabase session is invalid;
  // sign-out flushes the access token and `RequireAuth` then bounces the
  // user to /signin. We replace history so back-button doesn't return
  // them to a now-403 authed surface.
  const onAccountDeleted = useCallback(async (): Promise<void> => {
    await signOut().catch(() => undefined);
    navigate('/signin', { replace: true });
  }, [signOut, navigate]);

  const account = useAccountActions({ onAccountDeleted });

  // Inline OAuth-popup bridge — when "Connect Google Drive" fires from
  // any authed surface (UploadRoute, UseTemplatePage, IntegrationsPage),
  // the popup posts back via `postMessage` + a same-origin
  // BroadcastChannel. Mounting the listener at AppShell ensures the
  // parent tab catches the signal regardless of which page the user
  // launched the connect flow from. Pre-fix only IntegrationsPage
  // mounted it, so the inline-flow connect only worked when the user
  // happened to be on /settings/integrations.
  useGDriveOAuthMessageListener();

  const mode = !user && guest ? 'guest' : 'authed';

  // Discoverability for /settings/integrations — only an entry in the
  // avatar dropdown when the feature is on AND the user is authed. Guest
  // mode + flag-off both render the menu without the row, so the dropdown
  // stays lean. The `gdrive-feature-manager` skill forbids new top-level
  // NAV_ITEMS, so this is the canonical home for the entry point.
  const handleOpenIntegrations = useCallback((): void => {
    navigate('/settings/integrations');
  }, [navigate]);
  const onOpenIntegrations =
    mode === 'authed' && isFeatureEnabled('gdriveIntegration') ? handleOpenIntegrations : undefined;

  // Mobile (≤640px): the same routes render responsively — the NavBar
  // collapses to the mobile top bar and the bottom MobileNav carries the
  // destinations. (Until the v2 redesign every mobile visit bounced to
  // /m/send; that lock is gone.) Focused flows such as the guided approval
  // review keep the screen to themselves, without the bottom nav.
  const showMobileNav = isMobile && mode === 'authed' && !isMobileNavExempt(location.pathname);

  return (
    <Shell>
      <OfflineBar />
      <NavBar
        items={DESKTOP_NAV_ITEMS}
        activeItemId={activeNavId}
        onSelectItem={handleSelectNavItem}
        compact={isMobile}
        user={user ?? undefined}
        mode={mode}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onSignOut={handleSignOut}
        onOpenSettings={mode === 'authed' ? handleOpenSettings : undefined}
        helpHref={mode === 'authed' ? HELP_HREF : undefined}
        onExportData={mode === 'authed' ? account.exportData : undefined}
        onDeleteAccount={mode === 'authed' ? account.deleteAccount : undefined}
        onOpenIntegrations={onOpenIntegrations}
        rightSlot={mode === 'authed' && isApprovalsEnabled() ? <ApprovalsBell /> : undefined}
        isExporting={account.isExporting}
        isDeleting={account.isDeleting}
      />
      <Content key={location.pathname}>
        {/* Keyed by pathname so navigating to a different route remounts
            the boundary and clears any prior caught error — otherwise a
            crashed page would persist its fallback after the user navigates
            away via the NavBar. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
        {/* On phones the legal footer scrolls with the page so it never
            stacks on top of the bottom nav. */}
        {isMobile ? <ShellLegalFooter /> : null}
      </Content>
      {isMobile ? null : <ShellLegalFooter />}
      {showMobileNav ? (
        <MobileNav
          items={MOBILE_ITEMS}
          activeId={activeNavId}
          onNavigate={handleMobileNavigate}
          onNew={handleNewDocument}
        />
      ) : null}
      <SystemOverlays />
    </Shell>
  );
}
