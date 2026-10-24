import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { fireEvent, within } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { NavBar } from './NavBar';

describe('NavBar', () => {
  it('renders default nav items (Documents · Templates · Contacts) with Documents active', () => {
    const { getByRole, queryByRole } = renderWithTheme(<NavBar />);
    const nav = getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('button', { name: 'Documents' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('button', { name: 'Templates' })).not.toHaveAttribute(
      'aria-current',
    );
    expect(within(nav).getByRole('button', { name: 'Contacts' })).not.toHaveAttribute(
      'aria-current',
    );
    // v2 IA: no "Sign" tab — "New document" is the page's primary action.
    expect(queryByRole('button', { name: /^sign$/i })).toBeNull();
    expect(queryByRole('button', { name: 'Reports' })).toBeNull();
  });

  it('clicking an inactive item calls onSelectItem with correct id', async () => {
    const onSelectItem = vi.fn();
    const { getByRole } = renderWithTheme(<NavBar onSelectItem={onSelectItem} />);
    await userEvent.click(getByRole('button', { name: 'Templates' }));
    expect(onSelectItem).toHaveBeenCalledWith('templates');
  });

  it('renders href items as links and intercepts plain clicks for client routing', async () => {
    const onSelectItem = vi.fn();
    const { getByRole } = renderWithTheme(
      <NavBar
        onSelectItem={onSelectItem}
        activeItemId="signers"
        items={[
          { id: 'documents', label: 'Documents', href: '/documents', icon: FileText },
          { id: 'signers', label: 'Contacts', href: '/signers' },
        ]}
      />,
    );
    const contacts = getByRole('link', { name: 'Contacts' });
    expect(contacts).toHaveAttribute('href', '/signers');
    expect(contacts).toHaveAttribute('aria-current', 'page');
    const documents = getByRole('link', { name: 'Documents' });
    expect(documents.querySelector('svg')).not.toBeNull();
    await userEvent.click(documents);
    expect(onSelectItem).toHaveBeenCalledWith('documents');
  });

  it('lets modified clicks through (open in new tab)', () => {
    const onSelectItem = vi.fn();
    const { getByRole } = renderWithTheme(
      <NavBar
        onSelectItem={onSelectItem}
        items={[{ id: 'documents', label: 'Documents', href: '/documents' }]}
      />,
    );
    fireEvent.click(getByRole('link', { name: 'Documents' }), { ctrlKey: true });
    expect(onSelectItem).not.toHaveBeenCalled();
  });

  it('renders the Help link only when helpHref is set', () => {
    const { queryByRole, rerender } = renderWithTheme(<NavBar user={{ name: 'Jamie' }} />);
    expect(queryByRole('link', { name: 'Help' })).toBeNull();
    rerender(<NavBar user={{ name: 'Jamie' }} helpHref="mailto:help@example.com" />);
    expect(queryByRole('link', { name: 'Help' })).toHaveAttribute(
      'href',
      'mailto:help@example.com',
    );
  });

  it('compact mode (mobile top bar) drops the nav items and help but keeps the account', () => {
    const { queryByRole, getByRole } = renderWithTheme(
      <NavBar
        compact
        helpHref="mailto:x@y.z"
        user={{ name: 'Jamie Okonkwo' }}
        onSignOut={vi.fn()}
      />,
    );
    expect(queryByRole('navigation', { name: 'Primary' })).toBeNull();
    expect(queryByRole('link', { name: 'Help' })).toBeNull();
    expect(getByRole('button', { name: /open menu for jamie okonkwo/i })).toBeInTheDocument();
  });

  it('passes onOpenSettings through to the account menu', async () => {
    const onOpenSettings = vi.fn();
    const { getByRole } = renderWithTheme(
      <NavBar
        user={{ name: 'Jamie Okonkwo', email: 'j@seald.app' }}
        onSignOut={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    );
    await userEvent.click(getByRole('button', { name: /open menu for/i }));
    await userEvent.click(getByRole('menuitem', { name: 'Settings' }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('renders the right slot for a signed-in user and hides it in guest mode', () => {
    const slot = <button type="button">Slot item</button>;
    const authed = renderWithTheme(<NavBar user={{ name: 'Jamie Okonkwo' }} rightSlot={slot} />);
    expect(authed.getByRole('button', { name: 'Slot item' })).toBeInTheDocument();
    authed.unmount();
    const guest = renderWithTheme(<NavBar mode="guest" rightSlot={slot} />);
    expect(guest.queryByRole('button', { name: 'Slot item' })).toBeNull();
  });

  it('renders Avatar only when user prop is provided', () => {
    const { queryByRole, rerender } = renderWithTheme(<NavBar />);
    expect(queryByRole('img', { name: 'Jamie Okonkwo' })).toBeNull();
    rerender(<NavBar user={{ name: 'Jamie Okonkwo' }} />);
    expect(queryByRole('img', { name: 'Jamie Okonkwo' })).not.toBeNull();
  });

  it('has no axe violations on default render', async () => {
    const { container } = renderWithTheme(<NavBar user={{ name: 'Jamie Okonkwo' }} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the underlying <header> element', () => {
    const ref = createRef<HTMLElement>();
    renderWithTheme(<NavBar ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe('HEADER');
  });

  describe('guest mode', () => {
    it('renders the Guest mode chip and Sign in / Sign up buttons instead of nav items', () => {
      const { getByRole, queryByRole, getByLabelText } = renderWithTheme(
        <NavBar mode="guest" onSignIn={() => {}} onSignUp={() => {}} />,
      );
      expect(getByLabelText('Guest mode')).toBeInTheDocument();
      expect(getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(getByRole('button', { name: /sign up/i })).toBeInTheDocument();
      // Nav items should be hidden in guest mode.
      expect(queryByRole('button', { name: /documents/i })).toBeNull();
      expect(queryByRole('button', { name: /templates/i })).toBeNull();
      expect(queryByRole('button', { name: /contacts/i })).toBeNull();
    });

    it('Sign in / Sign up buttons call their respective handlers', async () => {
      const onSignIn = vi.fn();
      const onSignUp = vi.fn();
      const { getByRole } = renderWithTheme(
        <NavBar mode="guest" onSignIn={onSignIn} onSignUp={onSignUp} />,
      );
      await userEvent.click(getByRole('button', { name: /sign in/i }));
      await userEvent.click(getByRole('button', { name: /sign up/i }));
      expect(onSignIn).toHaveBeenCalledTimes(1);
      expect(onSignUp).toHaveBeenCalledTimes(1);
    });

    it('axe clean in guest mode', async () => {
      const { container } = renderWithTheme(
        <NavBar mode="guest" onSignIn={() => {}} onSignUp={() => {}} />,
      );
      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
