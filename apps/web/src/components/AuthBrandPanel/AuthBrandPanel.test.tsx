import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { AuthBrandPanel } from './AuthBrandPanel';

describe('AuthBrandPanel', () => {
  it('renders the heading "Documents, ... sealed ... in minutes."', () => {
    renderWithTheme(<AuthBrandPanel />);
    // "sealed" is wrapped in <em> inside the heading, so the whole string is
    // split across DOM nodes. Assert on substrings instead.
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('Documents,');
    expect(heading.textContent).toContain('sealed');
    expect(heading.textContent).toContain('in minutes.');
  });

  it('renders the testimonial quote', () => {
    renderWithTheme(<AuthBrandPanel />);
    expect(
      screen.getByText(/moved our entire contract workflow onto Seald in a weekend/i),
    ).toBeInTheDocument();
  });

  it('renders the author name and role', () => {
    renderWithTheme(<AuthBrandPanel />);
    expect(screen.getByText('Maya Raskin')).toBeInTheDocument();
    expect(screen.getByText(/General Counsel, Northwind/)).toBeInTheDocument();
  });

  it('renders the trust footer line with verifiable capability claims', () => {
    renderWithTheme(<AuthBrandPanel />);
    // Avoid certification claims (SOC 2 / ISO) and "eIDAS-qualified" framing
    // until those certifications exist or a QTSP is wired (T-13 in
    // .audit/LEGAL_GAPS.md). Assert the technical-capability replacements.
    expect(screen.getByText(/PAdES-LT/)).toBeInTheDocument();
    expect(screen.getByText(/RFC 3161 timestamps/)).toBeInTheDocument();
    expect(screen.getByText(/AES-256 at rest/)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<AuthBrandPanel />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the underlying <aside>', () => {
    const ref = { current: null as HTMLElement | null };
    renderWithTheme(<AuthBrandPanel ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe('ASIDE');
  });
});
