import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { FileText, LayoutTemplate, User, Users } from 'lucide-react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { MobileNav } from './MobileNav';

const ITEMS = [
  { id: 'documents', label: 'Documents', icon: FileText, href: '/documents' },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, href: '/templates' },
  { id: 'signers', label: 'Contacts', icon: Users, href: '/signers' },
  { id: 'settings', label: 'Me', icon: User, href: '/settings' },
];

describe('MobileNav', () => {
  it('renders Documents · Templates · New · Contacts · Me in order', () => {
    const { getByRole } = renderWithTheme(
      <MobileNav items={ITEMS} activeId="documents" onNavigate={vi.fn()} onNew={vi.fn()} />,
    );
    const nav = getByRole('navigation', { name: 'Main' });
    const names = Array.from(nav.querySelectorAll('a, button')).map(
      (el) => el.getAttribute('aria-label') ?? el.textContent,
    );
    expect(names).toEqual(['Documents', 'Templates', 'New document', 'Contacts', 'Me']);
  });

  it('marks the active destination', () => {
    const { getByRole } = renderWithTheme(
      <MobileNav items={ITEMS} activeId="signers" onNavigate={vi.fn()} onNew={vi.fn()} />,
    );
    expect(getByRole('link', { name: 'Contacts' })).toHaveAttribute('aria-current', 'page');
    expect(getByRole('link', { name: 'Documents' })).not.toHaveAttribute('aria-current');
  });

  it('navigates client-side on a plain click and calls onNew for the centre button', async () => {
    const onNavigate = vi.fn();
    const onNew = vi.fn();
    const { getByRole } = renderWithTheme(
      <MobileNav items={ITEMS} onNavigate={onNavigate} onNew={onNew} />,
    );
    await userEvent.click(getByRole('link', { name: 'Me' }));
    expect(onNavigate).toHaveBeenCalledWith('settings', '/settings');
    await userEvent.click(getByRole('button', { name: 'New document' }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it('lets modified clicks through to the browser', () => {
    const onNavigate = vi.fn();
    const { getByRole } = renderWithTheme(
      <MobileNav items={ITEMS} onNavigate={onNavigate} onNew={vi.fn()} />,
    );
    fireEvent.click(getByRole('link', { name: 'Templates' }), { metaKey: true });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <MobileNav items={ITEMS} activeId="documents" onNavigate={vi.fn()} onNew={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
