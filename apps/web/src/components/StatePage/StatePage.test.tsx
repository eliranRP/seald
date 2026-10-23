import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { AlertTriangle } from 'lucide-react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { StatePage } from './StatePage';

describe('StatePage', () => {
  it('renders the title as the page heading with its description and actions', () => {
    const { getByRole, getByText } = renderWithTheme(
      <StatePage title="Back soon" description="We are updating." icon={AlertTriangle}>
        <button type="button">Retry</button>
      </StatePage>,
    );
    expect(getByRole('heading', { level: 1, name: 'Back soon' })).toBeInTheDocument();
    expect(getByText('We are updating.')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('hides the decorative numeral from assistive tech', () => {
    const { getByText } = renderWithTheme(<StatePage code="404" title="Page not found" />);
    expect(getByText('404')).toHaveAttribute('aria-hidden', 'true');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<StatePage ref={ref} title="x" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<StatePage icon={AlertTriangle} tone="bad" title="Hi" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
