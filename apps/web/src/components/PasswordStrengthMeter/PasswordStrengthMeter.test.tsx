import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

describe('PasswordStrengthMeter', () => {
  it('renders "Too short" with aria-valuenow="0" and zero filled bars at level 0', () => {
    const { getByRole, getByText, getAllByTestId } = renderWithTheme(
      <PasswordStrengthMeter level={0} />,
    );
    const root = getByRole('progressbar');
    expect(root).toHaveAttribute('aria-valuenow', '0');
    expect(root).toHaveAttribute('aria-valuemin', '0');
    expect(root).toHaveAttribute('aria-valuemax', '4');
    expect(getByText('Too short')).toBeInTheDocument();
    // no semantic role: bars are decorative segments under the progressbar root (rule 4.6 escape hatch)
    const bars = getAllByTestId('password-strength-bar');
    expect(bars).toHaveLength(4);
    const filled = bars.filter((b) => b.getAttribute('data-filled') === 'true');
    expect(filled).toHaveLength(0);
  });

  it('renders the correct label for each level', () => {
    const labels: Array<[0 | 1 | 2 | 3 | 4, string]> = [
      [0, 'Too short'],
      [1, 'Weak'],
      [2, 'Okay'],
      [3, 'Strong'],
      [4, 'Excellent'],
    ];
    for (const [level, label] of labels) {
      const { getByText, unmount } = renderWithTheme(<PasswordStrengthMeter level={level} />);
      expect(getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('fills the correct number of bars for level={3}', () => {
    const { getAllByTestId } = renderWithTheme(<PasswordStrengthMeter level={3} />);
    // no semantic role: bars are decorative segments under the progressbar root (rule 4.6 escape hatch)
    const bars = getAllByTestId('password-strength-bar');
    const filled = bars.filter((b) => b.getAttribute('data-filled') === 'true');
    expect(filled).toHaveLength(3);
  });

  it('fills all 4 bars at level={4}', () => {
    const { getAllByTestId } = renderWithTheme(<PasswordStrengthMeter level={4} />);
    // no semantic role: bars are decorative segments under the progressbar root (rule 4.6 escape hatch)
    const bars = getAllByTestId('password-strength-bar');
    const filled = bars.filter((b) => b.getAttribute('data-filled') === 'true');
    expect(filled).toHaveLength(4);
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(<PasswordStrengthMeter level={2} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<PasswordStrengthMeter ref={ref} level={1} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards rest props (className, data-*) to the root element', () => {
    const { getByRole } = renderWithTheme(
      <PasswordStrengthMeter level={1} data-testid="psm" className="custom" />,
    );
    const root = getByRole('progressbar');
    expect(root).toHaveAttribute('data-testid', 'psm');
    expect(root).toHaveClass('custom');
  });
});
