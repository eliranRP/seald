import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { NavBar } from './NavBar';

describe('NavBar', () => {
  it('renders default nav items with Documents active', () => {
    const { getByRole } = renderWithTheme(<NavBar />);
    const active = getByRole('button', { name: 'Documents' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(getByRole('button', { name: 'Templates' })).not.toHaveAttribute('aria-current');
  });

  it('clicking an inactive item calls onSelectItem with correct id', async () => {
    const onSelectItem = vi.fn();
    const { getByRole } = renderWithTheme(<NavBar onSelectItem={onSelectItem} />);
    await userEvent.click(getByRole('button', { name: 'Templates' }));
    expect(onSelectItem).toHaveBeenCalledTimes(1);
    const first = onSelectItem.mock.calls[0];
    const id = first ? first[0] : undefined;
    expect(id).toBe('templates');
  });

  it('fires onSearch when the search pill is clicked', async () => {
    const onSearch = vi.fn();
    const { getByRole } = renderWithTheme(<NavBar onSearch={onSearch} />);
    await userEvent.click(getByRole('button', { name: /command palette/i }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('fires onBellClick when the bell is clicked', async () => {
    const onBellClick = vi.fn();
    const { getByRole } = renderWithTheme(<NavBar onBellClick={onBellClick} />);
    await userEvent.click(getByRole('button', { name: 'Notifications' }));
    expect(onBellClick).toHaveBeenCalledTimes(1);
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
});
