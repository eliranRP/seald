import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders the label and value', () => {
    const { getByText } = renderWithTheme(
      <StatCard label="Awaiting you" value="12" tone="indigo" />,
    );
    expect(getByText('Awaiting you')).toBeInTheDocument();
    expect(getByText('12')).toBeInTheDocument();
  });

  it.each(['indigo', 'amber', 'emerald', 'red', 'neutral'] as const)('supports tone %s', (tone) => {
    const { getByText } = renderWithTheme(<StatCard label="Stat" value="1" tone={tone} />);
    expect(getByText('1')).toBeInTheDocument();
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<StatCard ref={ref} label="Stat" value="1" tone="neutral" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <StatCard label="Awaiting you" value="12" tone="indigo" />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
