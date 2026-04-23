import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { DocThumb } from './DocThumb';

describe('DocThumb', () => {
  it('is role="img" with aria-label=title', () => {
    const { getByRole } = renderWithTheme(<DocThumb title="NDA 2026" />);
    expect(getByRole('img', { name: 'NDA 2026' })).toBeInTheDocument();
  });

  it('shows "signed" label when signed', () => {
    const { getByText } = renderWithTheme(<DocThumb title="x" signed />);
    expect(getByText('signed')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<DocThumb title="x" signed />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<DocThumb title="x" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards rest props (data-*, className) to the root div', () => {
    const { getByRole } = renderWithTheme(
      <DocThumb title="x" data-testid="thumb" className="custom" />,
    );
    const el = getByRole('img');
    expect(el).toHaveAttribute('data-testid', 'thumb');
    expect(el).toHaveClass('custom');
  });
});
