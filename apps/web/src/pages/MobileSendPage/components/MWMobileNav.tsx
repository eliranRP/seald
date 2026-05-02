import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import styled from 'styled-components';
import { Avatar } from '@/components/Avatar';
import { useAuth } from '@/providers/AuthProvider';
import { useAccountActions } from '@/features/account';
import { NAV_ITEMS, matchNavId } from '@/layout/navItems';
import { MWBottomSheet } from './MWBottomSheet';

/**
 * Mobile-only top bar for `/m/send`. The desktop NavBar is too wide for a
 * 375 px viewport (its tab row alone overflows), so we ship a slim 52 px
 * bar with logo-left + hamburger-right. The hamburger opens an
 * `MWBottomSheet` that mirrors every desktop NavBar affordance: nav
 * destinations (Documents / Sign / Templates / Signers), profile chip,
 * export data, delete account, and sign-out (rule 4.6 — every action is
 * a `<button>` queryable by role+name).
 *
 * Account actions piggy-back the same `useAccountActions` hook the
 * desktop AppShell uses so behaviour stays identical (window.prompt
 * confirm phrase for delete; blob download for export). Sign-out is
 * delegated to a parent-supplied callback so the page can sequence
 * post-sign-out navigation.
 */

const Bar = styled.header`
  position: sticky;
  top: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 12px 0 16px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
`;

const Brand = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 6px 4px;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 18px;
  font-weight: 500;
  color: var(--fg-1);
  letter-spacing: -0.01em;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

const BrandMark = styled.span`
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--indigo-600);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

/**
 * Quill/seal brand mark — mirrors the inline SVG used by the desktop
 * `NavBar.SealedMark` so the mobile bar reads as the same product. Kept
 * inline (rather than imported as an SVG asset) so it inherits
 * `currentColor` and ships with the component in tests/Storybook.
 */
function SealedMark(): ReactNode {
  return (
    <svg viewBox="0 0 40 40" width="14" height="14" fill="none" aria-hidden="true">
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
        <path
          d="M0 28 C 8 26, 18 26, 28 28"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
      </g>
    </svg>
  );
}

const HamburgerBtn = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: var(--ink-100);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-1);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const SheetHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 4px 16px;
`;

const HeaderText = styled.div`
  flex: 1;
  min-width: 0;
`;

const HeaderName = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: var(--fg-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const HeaderEmail = styled.div`
  font-size: 13px;
  color: var(--fg-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const SheetClose = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--ink-100);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-1);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const SectionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const SectionDivider = styled.hr`
  border: none;
  border-top: 1px solid var(--border-1);
  margin: 12px 0;
`;

const SheetItem = styled.button<{ $active?: boolean; $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  border: none;
  background: ${({ $active }) => ($active ? 'var(--ink-100)' : 'transparent')};
  border-radius: 12px;
  padding: 14px 14px;
  font: inherit;
  font-size: 15px;
  font-weight: ${({ $active }) => ($active ? 600 : 500)};
  color: ${({ $danger }) => ($danger ? 'var(--danger-700)' : 'var(--fg-1)')};
  cursor: pointer;
  min-height: 48px;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const ActiveDot = styled.span`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--indigo-600);
`;

export interface MWMobileNavProps {
  /**
   * Called after a confirmed sign-out request. The parent page is
   * responsible for the post-sign-out navigation (typically
   * `navigate('/signin', { replace: true })`).
   */
  readonly onSignOut: () => void | Promise<void>;
}

export function MWMobileNav(props: MWMobileNavProps): ReactNode {
  const { onSignOut } = props;
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const account = useAccountActions();

  const closeSheet = useCallback((): void => {
    setOpen(false);
  }, []);

  const handleNav = useCallback(
    (path: string): void => {
      setOpen(false);
      navigate(path);
    },
    [navigate],
  );

  const handleExport = useCallback((): void => {
    void account.exportData();
  }, [account]);

  const handleDelete = useCallback((): void => {
    void account.deleteAccount();
  }, [account]);

  const handleSignOut = useCallback((): void => {
    setOpen(false);
    void Promise.resolve(onSignOut());
  }, [onSignOut]);

  const activeId = matchNavId(location.pathname);
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'You';
  const displayEmail = user?.email ?? '';
  const sheetTitleId = 'mw-mobile-nav-title';

  return (
    <>
      <Bar role="banner">
        <Brand type="button" aria-label="Seald home" onClick={() => navigate('/documents')}>
          <BrandMark aria-hidden>
            <SealedMark />
          </BrandMark>
          Seald
        </Brand>
        <HamburgerBtn
          type="button"
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu size={20} aria-hidden />
        </HamburgerBtn>
      </Bar>
      <MWBottomSheet open={open} onClose={closeSheet} labelledBy={sheetTitleId}>
        <SheetHeader>
          <Avatar
            name={displayName}
            size={40}
            {...(user?.avatarUrl ? { imageUrl: user.avatarUrl } : {})}
          />
          <HeaderText>
            <HeaderName id={sheetTitleId}>{displayName}</HeaderName>
            {displayEmail && <HeaderEmail>{displayEmail}</HeaderEmail>}
          </HeaderText>
          <SheetClose type="button" aria-label="Close menu" onClick={closeSheet}>
            <X size={18} aria-hidden />
          </SheetClose>
        </SheetHeader>
        <SectionList role="navigation" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const isActive = item.id === activeId;
            return (
              <SheetItem
                key={item.id}
                type="button"
                $active={isActive}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleNav(item.path)}
              >
                {item.label}
                {isActive && <ActiveDot aria-hidden />}
              </SheetItem>
            );
          })}
        </SectionList>
        <SectionDivider />
        <SectionList>
          <SheetItem
            type="button"
            onClick={handleExport}
            disabled={account.isExporting}
            aria-busy={account.isExporting || undefined}
          >
            {account.isExporting ? 'Preparing download…' : 'Download my data'}
          </SheetItem>
          <SheetItem type="button" onClick={handleSignOut}>
            Sign out
          </SheetItem>
          <SheetItem
            type="button"
            $danger
            onClick={handleDelete}
            disabled={account.isDeleting}
            aria-busy={account.isDeleting || undefined}
          >
            {account.isDeleting ? 'Deleting account…' : 'Delete account'}
          </SheetItem>
        </SectionList>
      </MWBottomSheet>
    </>
  );
}
