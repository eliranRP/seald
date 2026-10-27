import { useCallback, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { MobileNav } from '../components/MobileNav';
import { NavBar } from '../components/NavBar';
import { OfflineBar } from '../components/OfflineBar';
import { screenEnter } from '@/styles/motion';
import { useAppState } from '../providers/AppStateProvider';
import { useAuth } from '../providers/AuthProvider';
import { ApprovalsBell, isApprovalsEnabled } from '@/features/approvals';
import { useGDriveOAuthMessageListener } from '@/routes/settings/integrations/useGDriveAccounts';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';
import { MOBILE_NAV_ITEMS, NAV_ITEMS, NEW_DOCUMENT_PATH, matchNavId } from './navItems';
import { isMobileNavExempt } from './mobileNavExempt';
import { SystemOverlays } from './SystemOverlays';
import { FocusedShellProvider } from './shellChrome';

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
  /* Dynamic viewport on phones: with plain 100vh, iOS Safari's toolbar
     covers the bottom of the shell, and with it the MobileNav. */
  height: 100dvh;
  overflow: hidden;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/**
 * "Skip to content" link: the first Tab stop, hidden until focused, so
 * keyboard users can jump past the top bar (UX rules:
 * visual-system-and-accessibility § 8).
 */
const SkipLink = styled.a`
  position: fixed;
  top: ${({ theme }) => theme.space[2]};
  left: ${({ theme }) => theme.space[2]};
  z-index: ${({ theme }) => theme.z.toast};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-decoration: none;
  translate: 0 calc(-100% - ${({ theme }) => theme.space[4]});
  &:focus-visible,
  &:focus {
    translate: 0 0;
  }
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
  /* Focus target of the skip link; it never shows a ring of its own. */
  &:focus {
    outline: none;
  }
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
  /* Short pages: rest at the bottom of the viewport, not mid-screen. */
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 18px;
  align-items: center;
  justify-content: center;
  padding: 14px 24px;
  font-size: ${({ theme }) => theme.font.size.xs};
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

  /* 12px text links are tiny targets; pad them to 44px on touch. */
  @media (pointer: coarse) {
    a,
    button {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
    }
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
  // Upload, Prepare and the template editor bring their own flow header
  // (see `useFocusedShell`), so the top bar, footer and bottom nav step aside.
  const [focused, setFocused] = useState(false);

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

  // Mobile (≤640px): the same routes render responsively — the NavBar
  // collapses to the mobile top bar and the bottom MobileNav carries the
  // destinations. (Until the v2 redesign every mobile visit bounced to
  // /m/send; that lock is gone.) Focused flows such as the guided approval
  // review keep the screen to themselves, without the bottom nav.
  const showMobileNav =
    isMobile && mode === 'authed' && !focused && !isMobileNavExempt(location.pathname);

  return (
    <Shell>
      <SkipLink
        href="#main-content"
        onClick={(event) => {
          // Focus <main> directly: a bare hash would push a history entry.
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </SkipLink>
      <OfflineBar />
      {focused ? null : (
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
          rightSlot={mode === 'authed' && isApprovalsEnabled() ? <ApprovalsBell /> : undefined}
        />
      )}
      <Content key={location.pathname} id="main-content" tabIndex={-1}>
        {/* Keyed by pathname so navigating to a different route remounts
            the boundary and clears any prior caught error — otherwise a
            crashed page would persist its fallback after the user navigates
            away via the NavBar. */}
        <FocusedShellProvider value={setFocused}>
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </FocusedShellProvider>
        {/* The legal footer sits at the end of the page and scrolls with it
            (the design has no pinned bar); focused flows leave it out. */}
        {focused ? null : <ShellLegalFooter />}
      </Content>
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
