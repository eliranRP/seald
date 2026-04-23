import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SideBar } from './SideBar';

describe('SideBar', () => {
  it('renders default items with Inbox active', () => {
    const { getByRole } = renderWithTheme(<SideBar />);
    const inbox = getByRole('button', { name: /Inbox/ });
    expect(inbox).toHaveAttribute('aria-current', 'page');
    const sent = getByRole('button', { name: /Sent/ });
    expect(sent).not.toHaveAttribute('aria-current');
  });

  it('clicking a different item fires onSelectItem once with correct id', async () => {
    const onSelectItem = vi.fn();
    const { getByRole } = renderWithTheme(<SideBar onSelectItem={onSelectItem} />);
    await userEvent.click(getByRole('button', { name: /Sent/ }));
    expect(onSelectItem).toHaveBeenCalledTimes(1);
    const first = onSelectItem.mock.calls[0];
    const id = first ? first[0] : undefined;
    expect(id).toBe('sent');
  });

  it('renders count badges only when provided', () => {
    const { getByRole } = renderWithTheme(<SideBar />);
    expect(getByRole('button', { name: /Inbox 3/ })).toBeDefined();
    expect(getByRole('button', { name: /Sent 12/ })).toBeDefined();
    const templates = getByRole('button', { name: /Templates/ });
    expect(templates.textContent).toBe('Templates');
  });

  it('clicking the primary action button fires primaryAction.onClick', async () => {
    const onClick = vi.fn();
    const { getByRole } = renderWithTheme(
      <SideBar primaryAction={{ label: 'New document', onClick }} />,
    );
    await userEvent.click(getByRole('button', { name: 'New document' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders default folders and fires onSelectFolder with id on click', async () => {
    const onSelectFolder = vi.fn();
    const { getByRole } = renderWithTheme(<SideBar onSelectFolder={onSelectFolder} />);
    await userEvent.click(getByRole('button', { name: /Client contracts/ }));
    expect(onSelectFolder).toHaveBeenCalledTimes(1);
    const first = onSelectFolder.mock.calls[0];
    const id = first ? first[0] : undefined;
    expect(id).toBe('client');
  });

  it('has no axe violations on default render', async () => {
    const { container } = renderWithTheme(
      <SideBar primaryAction={{ label: 'New document', onClick: () => {} }} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the underlying <aside> element', () => {
    const ref = createRef<HTMLElement>();
    renderWithTheme(<SideBar ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe('ASIDE');
  });
});
