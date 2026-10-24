import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { FileText } from 'lucide-react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders children', () => {
    const { getByText } = renderWithTheme(<EmptyState>No items yet.</EmptyState>);
    expect(getByText('No items yet.')).toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<EmptyState ref={ref}>Empty</EmptyState>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards rest props', () => {
    const { container } = renderWithTheme(
      <EmptyState data-testid="empty" className="custom">
        Empty
      </EmptyState>,
    );
    const el = container.querySelector('[data-testid="empty"]');
    expect(el).not.toBeNull();
    expect(el).toHaveClass('custom');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<EmptyState>Nothing here.</EmptyState>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders icon art, a title heading and one action', () => {
    const { getByRole, container } = renderWithTheme(
      <EmptyState
        icon={FileText}
        title="No documents yet"
        action={<button type="button">New document</button>}
      />,
    );
    expect(getByRole('heading', { name: 'No documents yet' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'New document' })).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"] svg')).not.toBeNull();
  });
});
