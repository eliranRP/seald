import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { FilterTabs } from './FilterTabs';

const items = [
  { id: 'all', label: 'All', count: 5 },
  { id: 'drafts', label: 'Drafts', count: 2 },
  { id: 'completed', label: 'Completed' },
] as const;

describe('FilterTabs', () => {
  it('renders each item with its label', () => {
    renderWithTheme(
      <FilterTabs items={items} activeId="all" onSelect={() => undefined} aria-label="Filters" />,
    );
    expect(screen.getByRole('tab', { name: /all 5 items/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /drafts 2 items/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /completed/i })).toBeInTheDocument();
  });

  it('marks only the active tab with aria-selected=true', () => {
    renderWithTheme(
      <FilterTabs
        items={items}
        activeId="drafts"
        onSelect={() => undefined}
        aria-label="Filters"
      />,
    );
    expect(screen.getByRole('tab', { name: /drafts 2 items/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /all 5 items/i })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('fires onSelect with the id when a tab is clicked', async () => {
    const onSelect = vi.fn();
    renderWithTheme(
      <FilterTabs items={items} activeId="all" onSelect={onSelect} aria-label="Filters" />,
    );
    await userEvent.click(screen.getByRole('tab', { name: /completed/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('completed');
  });

  it('omits the count pill when count is undefined', () => {
    renderWithTheme(
      <FilterTabs items={items} activeId="all" onSelect={() => undefined} aria-label="Filters" />,
    );
    // Completed has no count, so no "items" text beyond the tab name.
    const completed = screen.getByRole('tab', { name: /completed/i });
    expect(completed.textContent).toBe('Completed');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <FilterTabs items={items} activeId="all" onSelect={() => undefined} aria-label="Filters" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
