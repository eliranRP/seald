import { useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { NavBar } from '../components/NavBar';
import { useAppState } from '../providers/AppStateProvider';
import { useAuth } from '../providers/AuthProvider';
import { NAV_ITEMS, matchNavId } from './navItems';

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const Content = styled.main`
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
`;

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

  const mode = !user && guest ? 'guest' : 'authed';

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
      />
      <Content>
        <Outlet />
      </Content>
    </Shell>
  );
}
