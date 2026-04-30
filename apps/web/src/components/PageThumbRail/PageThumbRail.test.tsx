import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { PageThumbRail } from './PageThumbRail';

describe('PageThumbRail', () => {
  it('renders one thumb per page in `totalPages`', () => {
    const { getAllByRole } = renderWithTheme(
      <PageThumbRail totalPages={6} currentPage={1} onSelectPage={() => {}} />,
    );
    // Each thumb is a <button> labelled "Page N"; expect 6 of them.
    const thumbs = getAllByRole('button').filter((b) =>
      /^Page \d+/.test(b.getAttribute('aria-label') ?? ''),
    );
    expect(thumbs).toHaveLength(6);
  });

  it('marks the current page with aria-current=page', () => {
    const { getByRole } = renderWithTheme(
      <PageThumbRail totalPages={4} currentPage={3} onSelectPage={() => {}} />,
    );
    const current = getByRole('button', { name: /^Page 3/ });
    expect(current.getAttribute('aria-current')).toBe('page');
  });

  it('clicking a thumb fires onSelectPage with that page', () => {
    const onSelectPage = vi.fn();
    const { getByRole } = renderWithTheme(
      <PageThumbRail totalPages={3} currentPage={1} onSelectPage={onSelectPage} />,
    );
    fireEvent.click(getByRole('button', { name: /^Page 2/ }));
    expect(onSelectPage).toHaveBeenCalledWith(2);
  });

  // Regression for the templates-editor scroll bug: the rail must
  // size relative to the viewport (not a hard-coded chrome height),
  // otherwise the templates flow's extra TemplateFlowHeader pushes
  // the rail past the visible area and clips bottom thumbs. We assert
  // the computed `max-height` is a vh-based value so any future
  // change away from that will be flagged.
  it('caps max-height to a viewport-relative value (regression: templates-editor clipping)', () => {
    const { getByRole } = renderWithTheme(
      <PageThumbRail totalPages={20} currentPage={1} onSelectPage={() => {}} />,
    );
    const nav = getByRole('navigation');
    const computed = window.getComputedStyle(nav);
    // jsdom resolves `80vh` to a px value at 768 default height. We
    // accept either the literal vh string OR a px value <= viewport
    // height; what we DON'T want is the old `calc(100vh - 160px)`
    // which leaks chrome assumptions into the rail.
    const maxHeight = computed.maxHeight;
    expect(maxHeight).toBeTruthy();
    expect(maxHeight).not.toMatch(/calc\(100vh - 160px\)/);
  });

  it('Arrow Down advances the page within bounds', () => {
    const onSelectPage = vi.fn();
    const { getByRole } = renderWithTheme(
      <PageThumbRail totalPages={5} currentPage={2} onSelectPage={onSelectPage} />,
    );
    fireEvent.keyDown(getByRole('navigation'), { key: 'ArrowDown' });
    expect(onSelectPage).toHaveBeenCalledWith(3);
  });

  it('End jumps to the last page', () => {
    const onSelectPage = vi.fn();
    const { getByRole } = renderWithTheme(
      <PageThumbRail totalPages={9} currentPage={2} onSelectPage={onSelectPage} />,
    );
    fireEvent.keyDown(getByRole('navigation'), { key: 'End' });
    expect(onSelectPage).toHaveBeenCalledWith(9);
  });

  it('Home jumps to page 1', () => {
    const onSelectPage = vi.fn();
    const { getByRole } = renderWithTheme(
      <PageThumbRail totalPages={9} currentPage={5} onSelectPage={onSelectPage} />,
    );
    fireEvent.keyDown(getByRole('navigation'), { key: 'Home' });
    expect(onSelectPage).toHaveBeenCalledWith(1);
  });
});
