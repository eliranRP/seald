import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { GuestBadge } from './GuestBadge';

describe('GuestBadge', () => {
  it('renders default "Guest mode" text', () => {
    const { getByText } = renderWithTheme(<GuestBadge />);
    expect(getByText('Guest mode')).toBeInTheDocument();
  });

  it('renders a custom label when provided', () => {
    const { getByText, queryByText } = renderWithTheme(<GuestBadge label="Visitor" />);
    expect(getByText('Visitor')).toBeInTheDocument();
    expect(queryByText('Guest mode')).not.toBeInTheDocument();
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(<GuestBadge />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root span', () => {
    const ref = { current: null as HTMLSpanElement | null };
    renderWithTheme(<GuestBadge ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });
});
