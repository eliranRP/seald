import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders text content', () => {
    const { getByText } = renderWithTheme(<Badge>Completed</Badge>);
    expect(getByText('Completed')).toBeInTheDocument();
  });

  it('shows a dot by default, hides it when dot={false}', () => {
    const { container, rerender } = renderWithTheme(<Badge>Awaiting you</Badge>);
    expect(container.querySelector('[data-part="dot"]')).toBeInTheDocument();
    rerender(<Badge dot={false}>Awaiting you</Badge>);
    expect(container.querySelector('[data-part="dot"]')).toBeNull();
  });

  it.each(['indigo', 'amber', 'emerald', 'red', 'neutral'] as const)('supports tone %s', (tone) => {
    const { getByText } = renderWithTheme(<Badge tone={tone}>{tone}</Badge>);
    expect(getByText(tone)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<Badge>OK</Badge>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root span', () => {
    const ref = { current: null as HTMLSpanElement | null };
    renderWithTheme(<Badge ref={ref}>X</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('forwards rest props (className, data-*) to the root span', () => {
    const { container } = renderWithTheme(
      <Badge data-testid="badge" className="custom">
        X
      </Badge>,
    );
    const span = container.querySelector('[data-testid="badge"]');
    expect(span).not.toBeNull();
    expect(span).toHaveClass('custom');
  });
});
