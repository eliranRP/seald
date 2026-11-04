import { forwardRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Icon } from '../Icon';
import type { MobileNavItem, MobileNavProps } from './MobileNav.types';
import { MobileNavLink, MobileNavNew, MobileNavRoot } from './MobileNav.styles';

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * L2 component — bottom tab bar for ≤640px viewports (canvas `.m-nav`):
 * two destinations · raised "New" button · two destinations.
 */
export const MobileNav = forwardRef<HTMLElement, MobileNavProps>((props, ref) => {
  const {
    items,
    activeId,
    onNavigate,
    onNew,
    newLabel = 'New document',
    calm = false,
    ...rest
  } = props;

  const renderLink = (item: MobileNavItem): ReactNode => (
    <MobileNavLink
      key={item.id}
      href={item.href}
      aria-current={item.id === activeId ? 'page' : undefined}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onNavigate(item.id, item.href);
      }}
    >
      <Icon icon={item.icon} size={20} />
      {item.label}
    </MobileNavLink>
  );

  return (
    <MobileNavRoot ref={ref} aria-label="Main" {...rest}>
      {items.slice(0, 2).map(renderLink)}
      <MobileNavNew
        type="button"
        aria-label={newLabel}
        data-calm={calm ? 'true' : undefined}
        onClick={onNew}
      >
        <Icon icon={Plus} size={20} />
      </MobileNavNew>
      {items.slice(2).map(renderLink)}
    </MobileNavRoot>
  );
});
MobileNav.displayName = 'MobileNav';
