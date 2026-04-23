import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { EmailMasthead } from './EmailMasthead';

describe('EmailMasthead', () => {
  it('renders the brand name', () => {
    renderWithTheme(<EmailMasthead brand="Seald" />);
    expect(screen.getByText('Seald')).toBeInTheDocument();
  });

  it('defaults the mark to the first letter of brand', () => {
    const { container } = renderWithTheme(<EmailMasthead brand="Seald" />);
    // First letter should appear inside the masthead.
    expect(container.textContent).toContain('S');
  });

  it('renders a custom mark when supplied', () => {
    renderWithTheme(<EmailMasthead brand="Seald" mark={<span>::</span>} />);
    expect(screen.getByText('::')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<EmailMasthead brand="Seald" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<EmailMasthead ref={ref} brand="Seald" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
