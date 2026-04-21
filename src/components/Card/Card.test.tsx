import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { Card } from './Card';

describe('Card', () => {
  it('renders its children inside a div by default', () => {
    const { getByText, container } = renderWithTheme(<Card>hello</Card>);
    expect(getByText('hello')).toBeInTheDocument();
    expect(container.firstChild?.nodeName).toBe('DIV');
  });

  it('becomes a <section> when given an aria-label', () => {
    const { getByRole } = renderWithTheme(<Card aria-label="Document preview">x</Card>);
    expect(getByRole('region', { name: 'Document preview' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<Card aria-label="Card">x</Card>);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root element', () => {
    const ref = { current: null as HTMLElement | null };
    renderWithTheme(<Card ref={ref}>x</Card>);
    expect(ref.current).toBeInstanceOf(HTMLElement);
  });

  it('forwards rest props (className, data-*) to the root element', () => {
    const { container } = renderWithTheme(
      <Card data-testid="card" className="custom">
        x
      </Card>,
    );
    const el = container.querySelector('[data-testid="card"]');
    expect(el).not.toBeNull();
    expect(el).toHaveClass('custom');
  });
});
