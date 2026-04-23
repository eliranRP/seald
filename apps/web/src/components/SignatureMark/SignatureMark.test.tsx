import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SignatureMark } from './SignatureMark';

describe('SignatureMark', () => {
  it('renders the name text', () => {
    const { getByText } = renderWithTheme(<SignatureMark name="Jamie Okonkwo" />);
    expect(getByText('Jamie Okonkwo')).toBeInTheDocument();
  });

  it('is aria-hidden by default (decorative)', () => {
    const { container } = renderWithTheme(<SignatureMark name="Jamie" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('hides the underline when underline={false}', () => {
    const { container } = renderWithTheme(<SignatureMark name="Jamie" underline={false} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<SignatureMark name="Jamie" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<SignatureMark name="J" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards rest props (data-*, className) to the root div', () => {
    const { container } = renderWithTheme(
      <SignatureMark name="J" data-testid="sig" className="custom" />,
    );
    const el = container.querySelector('[data-testid="sig"]');
    expect(el).not.toBeNull();
    expect(el).toHaveClass('custom');
  });
});
