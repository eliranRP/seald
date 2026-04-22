import { useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { NavBar } from '../components/NavBar';
import { useAppState } from '../providers/AppStateProvider';

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
 * Maps NavBar items to URL pathnames. Central so the NavBar's active state
 * is derived purely from the URL.
 */
const NAV_ITEMS = [
  { id: 'documents', label: 'Documents', path: '/documents' },
  { id: 'templates', label: 'Templates', path: '/templates' },
  { id: 'signers', label: 'Signers', path: '/signers' },
  { id: 'reports', label: 'Reports', path: '/reports' },
] as const;

function matchNavId(pathname: string): string {
  const match = NAV_ITEMS.find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  );
  if (match) {
    return match.id;
  }
  // Document editor lives under /document/*; keep Documents highlighted there.
  if (pathname.startsWith('/document')) {
    return 'documents';
  }
  return 'documents';
}

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
      <NavBar activeItemId={activeNavId} onSelectItem={handleSelectNavItem} user={user} />
      <Content>
        <Outlet />
      </Content>
    </Shell>
  );
}
