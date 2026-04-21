import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders initials fallback with role="img" aria-label', () => {
    const { getByRole } = renderWithTheme(<Avatar name="Jamie Okonkwo" />);
    expect(getByRole('img', { name: 'Jamie Okonkwo' })).toBeInTheDocument();
  });

  it('uses <img> with alt when imageUrl provided', () => {
    const { getByAltText } = renderWithTheme(
      <Avatar name="Jamie" imageUrl="https://example.com/a.png" />,
    );
    expect(getByAltText('Jamie')).toBeInTheDocument();
  });

  it('derives initials from first and last char of words', () => {
    const { getByText } = renderWithTheme(<Avatar name="Jamie Okonkwo" />);
    expect(getByText('JO')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<Avatar name="JO" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<Avatar name="X" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards rest props (data-*, className) to the root div', () => {
    const { getByRole } = renderWithTheme(
      <Avatar name="X" data-testid="avatar" className="custom" />,
    );
    const el = getByRole('img');
    expect(el).toHaveAttribute('data-testid', 'avatar');
    expect(el).toHaveClass('custom');
  });
});
