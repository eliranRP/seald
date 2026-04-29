import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { NavBar } from './NavBar';

describe('NavBar', () => {
  it('renders default nav items with Documents active', () => {
    const { getByRole, queryByRole } = renderWithTheme(<NavBar />);
    const active = getByRole('button', { name: 'Documents' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(getByRole('button', { name: 'Sign' })).not.toHaveAttribute('aria-current');
    expect(getByRole('button', { name: 'Templates' })).not.toHaveAttribute('aria-current');
    expect(getByRole('button', { name: 'Signers' })).not.toHaveAttribute('aria-current');
    // Reports was retired in the original 4 → 3 trim; Templates was added
    // back when the templates feature shipped (PR #11).
    expect(queryByRole('button', { name: 'Reports' })).toBeNull();
  });

  it('clicking an inactive item calls onSelectItem with correct id', async () => {
    const onSelectItem = vi.fn();
    const { getByRole } = renderWithTheme(<NavBar onSelectItem={onSelectItem} />);
    await userEvent.click(getByRole('button', { name: 'Sign' }));
    expect(onSelectItem).toHaveBeenCalledTimes(1);
    const first = onSelectItem.mock.calls[0];
    const id = first ? first[0] : undefined;
    expect(id).toBe('sign');
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
      expect(queryByRole('button', { name: /^sign$/i })).toBeNull();
      expect(queryByRole('button', { name: /signers/i })).toBeNull();
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
