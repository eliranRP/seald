import { useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { NavBar } from '../components/NavBar';
import { useAppState } from '../providers/AppStateProvider';
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
 * L4 layout — wraps routed pages with the shared NavBar so the chrome doesn't
 * reflow between tabs. Pages render into `<Outlet />`.
 */
export function AppShell() {
  const { user } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();
  const activeNavId = matchNavId(location.pathname);

  const handleSelectNavItem = useCallback(
    (id: string): void => {
      const item = NAV_ITEMS.find((n) => n.id === id);
      if (item) {
        navigate(item.path);
      }
    },
    [navigate],
  );

  return (
    <Shell>
      <NavBar
        activeItemId={activeNavId}
        onSelectItem={handleSelectNavItem}
        user={user ?? undefined}
      />
      <Content>
        <Outlet />
      </Content>
    </Shell>
  );
}
