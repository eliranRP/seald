import { forwardRef } from 'react';
import { Bookmark, CheckCircle2, FileText, Folder, Inbox, Send, UploadCloud } from 'lucide-react';
import { Button } from '../Button';
import { seald } from '../../styles/theme';
import type { SideBarFolder, SideBarNavItem, SideBarProps } from './SideBar.types';
import {
  Aside,
  FolderButton,
  FolderHeading,
  FolderList,
  FolderListItem,
  NavItemButton,
  NavItemCount,
  NavItemLabel,
  NavList,
  NavListItem,
  PrimaryActionSlot,
  SectionSpacer,
  TopSpacer,
} from './SideBar.styles';

const DEFAULT_ITEMS: ReadonlyArray<SideBarNavItem> = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, count: 3 },
  { id: 'sent', label: 'Sent', icon: Send, count: 12 },
  { id: 'drafts', label: 'Drafts', icon: FileText, count: 2 },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, count: 48 },
  { id: 'templates', label: 'Templates', icon: Bookmark },
];

const DEFAULT_FOLDERS: ReadonlyArray<SideBarFolder> = [
  { id: 'client', label: 'Client contracts' },
  { id: 'hr', label: 'HR' },
  { id: 'vendor', label: 'Vendor NDAs' },
];

export const SideBar = forwardRef<HTMLElement, SideBarProps>((props, ref) => {
  const {
    items = DEFAULT_ITEMS,
    activeItemId = 'inbox',
    onSelectItem,
    folders = DEFAULT_FOLDERS,
    activeFolderId,
    onSelectFolder,
    primaryAction,
    ...rest
  } = props;

  const ActionIcon = primaryAction?.icon ?? UploadCloud;
  const actionLabel = primaryAction?.label ?? 'New document';

  return (
    <Aside {...rest} ref={ref} aria-label="Primary navigation">
      {primaryAction ? (
        <>
          <PrimaryActionSlot>
            <Button
              variant="primary"
              iconLeft={ActionIcon}
              fullWidth
              onClick={primaryAction.onClick}
            >
              {actionLabel}
            </Button>
          </PrimaryActionSlot>
          <TopSpacer />
        </>
      ) : null}
      <nav aria-label="Sections">
        <NavList>
          {items.map((item) => {
            const isActive = item.id === activeItemId;
            const ariaCurrent = isActive ? ('page' as const) : undefined;
            const ItemIcon = item.icon;
            const iconColor = isActive ? seald.color.indigo[600] : seald.color.fg[3];
            return (
              <NavListItem key={item.id}>
                <NavItemButton
                  type="button"
                  $active={isActive}
                  aria-current={ariaCurrent}
                  onClick={() => onSelectItem?.(item.id)}
                >
                  <ItemIcon size={16} strokeWidth={1.75} color={iconColor} aria-hidden />
                  <NavItemLabel>{item.label}</NavItemLabel>
                  {item.count !== undefined ? <NavItemCount>{item.count}</NavItemCount> : null}
                </NavItemButton>
              </NavListItem>
            );
          })}
        </NavList>
      </nav>
      <SectionSpacer />
      <FolderHeading>Folders</FolderHeading>
      <FolderList>
        {folders.map((folder) => {
          const isActive = folder.id === activeFolderId;
          const ariaCurrent = isActive ? ('page' as const) : undefined;
          return (
            <FolderListItem key={folder.id}>
              <FolderButton
                type="button"
                $active={isActive}
                aria-current={ariaCurrent}
                onClick={() => onSelectFolder?.(folder.id)}
              >
                <Folder size={16} strokeWidth={1.75} color={seald.color.fg[3]} aria-hidden />
                <span>{folder.label}</span>
              </FolderButton>
            </FolderListItem>
          );
        })}
      </FolderList>
    </Aside>
  );
});

SideBar.displayName = 'SideBar';
