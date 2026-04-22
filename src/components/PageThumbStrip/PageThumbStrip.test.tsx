import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { PageThumbStrip } from './PageThumbStrip';

describe('PageThumbStrip', () => {
  it('renders one thumb per page', () => {
    const { getAllByRole } = renderWithTheme(
      <PageThumbStrip totalPages={5} currentPage={1} onSelectPage={() => {}} />,
    );
    expect(getAllByRole('button')).toHaveLength(5);
  });

  it('clicking a thumb calls onSelectPage with its 1-indexed page number', async () => {
    const onSelectPage = vi.fn();
    const { getByRole } = renderWithTheme(
      <PageThumbStrip totalPages={4} currentPage={1} onSelectPage={onSelectPage} />,
    );
    await userEvent.click(getByRole('button', { name: 'Page 2' }));
    expect(onSelectPage).toHaveBeenCalledTimes(1);
    const first = onSelectPage.mock.calls[0];
    const arg = first ? first[0] : undefined;
    expect(arg).toBe(2);
  });

  it('the currentPage thumb has aria-current="page"', () => {
    const { getByRole } = renderWithTheme(
      <PageThumbStrip totalPages={4} currentPage={3} onSelectPage={() => {}} />,
    );
    const current = getByRole('button', { current: 'page' });
    expect(current).toHaveTextContent('3');
  });

  it('thumbs listed in pagesWithFields have a ", has fields" aria-label suffix', () => {
    const { getByRole, queryByRole } = renderWithTheme(
      <PageThumbStrip
        totalPages={4}
        currentPage={4}
        onSelectPage={() => {}}
        pagesWithFields={[1, 4]}
      />,
    );
    expect(getByRole('button', { name: 'Page 1, has fields' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Page 4, has fields' })).toBeInTheDocument();
    expect(queryByRole('button', { name: 'Page 2, has fields' })).toBeNull();
    expect(getByRole('button', { name: 'Page 2' })).toBeInTheDocument();
  });

  it('ArrowRight keypress calls onSelectPage(currentPage+1), clamped to totalPages', () => {
    const onSelectPage = vi.fn();
    const { getByRole, rerender } = renderWithTheme(
      <PageThumbStrip totalPages={4} currentPage={2} onSelectPage={onSelectPage} />,
    );
    const nav = getByRole('navigation');
    fireEvent.keyDown(nav, { key: 'ArrowRight' });
    const first = onSelectPage.mock.calls[0];
    const arg = first ? first[0] : undefined;
    expect(arg).toBe(3);

    rerender(<PageThumbStrip totalPages={4} currentPage={4} onSelectPage={onSelectPage} />);
    fireEvent.keyDown(nav, { key: 'ArrowRight' });
    const second = onSelectPage.mock.calls[1];
    const arg2 = second ? second[0] : undefined;
    expect(arg2).toBe(4);
  });

  it('forwards ref to the <nav> element', () => {
    const ref = createRef<HTMLElement>();
    renderWithTheme(
      <PageThumbStrip ref={ref} totalPages={3} currentPage={1} onSelectPage={() => {}} />,
    );
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe('NAV');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <PageThumbStrip
        totalPages={4}
        currentPage={1}
        onSelectPage={() => {}}
        pagesWithFields={[2]}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
