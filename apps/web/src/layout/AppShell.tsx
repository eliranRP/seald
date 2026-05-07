import { useCallback } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isFeatureEnabled } from 'shared';
import styled from 'styled-components';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { NavBar } from '../components/NavBar';
import { useAppState } from '../providers/AppStateProvider';
import { useAuth } from '../providers/AuthProvider';
import { useAccountActions } from '@/features/account';
import { useGDriveOAuthMessageListener } from '@/routes/settings/integrations/useGDriveAccounts';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';
import { NAV_ITEMS, matchNavId } from './navItems';

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

  // 2026-05-03 (refined a second time per user) — the desktop AppShell
  // pages (/documents, /templates, /signers, /document/<id>,
  // /document/new, /templates/:id/use, /templates/:id/edit) were not
  // designed for a 390 px viewport: tables overlap, hero text wraps,
  // the title char-stacks, the NavBar tab row overflows. Rather than
  // retrofit responsiveness onto every desktop page, lock ALL mobile
  // users — authed AND guest — to the dedicated mobile sender at
  // /m/send. The mobile sender supports guest sessions on its own
  // (mirroring the desktop UploadRoute), so unauthed visitors land on
  // the mobile screens we built rather than the desktop chrome that
  // doesn't fit the viewport.
  if (isMobile) {
    return <Navigate to="/m/send" replace />;
  }

  return (
    <Shell>
      <NavBar
        items={NAV_ITEMS}
        activeItemId={activeNavId}
        onSelectItem={handleSelectNavItem}
        user={user ?? undefined}
        mode={mode}
        onSignIn={handleSignIn}
        onSignUp={handleSignUp}
        onSignOut={handleSignOut}
        onExportData={mode === 'authed' ? account.exportData : undefined}
        onDeleteAccount={mode === 'authed' ? account.deleteAccount : undefined}
        onOpenIntegrations={onOpenIntegrations}
        isExporting={account.isExporting}
        isDeleting={account.isDeleting}
      />
      <Content>
        {/* Keyed by pathname so navigating to a different route remounts
            the boundary and clears any prior caught error — otherwise a
            crashed page would persist its fallback after the user navigates
            away via the NavBar. */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </Content>
      <ShellLegalFooter />
    </Shell>
  );
}
