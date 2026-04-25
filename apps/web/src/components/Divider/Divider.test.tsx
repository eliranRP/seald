import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { Divider } from './Divider';

describe('Divider', () => {
  it('renders without a label (plain rule)', () => {
    const { getByRole, queryByText } = renderWithTheme(<Divider data-testid="d" />);
    expect(getByRole('separator')).toBeInTheDocument();
    expect(queryByText(/\w+/)).toBeNull();
  });

  it('renders the label text when provided', () => {
    const { getByText } = renderWithTheme(<Divider label="or" />);
    expect(getByText('or')).toBeInTheDocument();
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(<Divider label="or" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders without axe violations when label is omitted', async () => {
    const { container } = renderWithTheme(<Divider />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root element', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<Divider ref={ref} label="or" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards rest props (className, data-*) to the root', () => {
    const { getByTestId } = renderWithTheme(
      <Divider data-testid="divider" className="custom" label="or" />,
    );
    // testid intentional: this test asserts data-* prop forwarding (rule 4.6 escape hatch)
    const el = getByTestId('divider');
    expect(el).toHaveClass('custom');
  });
});
