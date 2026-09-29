import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { AuthBrandPanel } from './AuthBrandPanel';

describe('AuthBrandPanel', () => {
  it('renders the heading as an upload-and-send instruction', () => {
    renderWithTheme(<AuthBrandPanel />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading.textContent).toContain('Upload a PDF');
    expect(heading.textContent).not.toMatch(/in minutes/i);
  });

  it('renders a product value statement instead of a named testimonial', () => {
    renderWithTheme(<AuthBrandPanel />);
    expect(screen.getByText(/hash-chained audit trail/i).tagName).toBe('P');
    expect(screen.queryByText('Maya Raskin')).not.toBeInTheDocument();
    expect(screen.queryByText(/Northwind/)).not.toBeInTheDocument();
  });

  it('renders the trust footer without AES-256 or PAdES-LT guarantees', () => {
    renderWithTheme(<AuthBrandPanel />);
    expect(screen.getByText(/PAdES seal when applied/)).toBeInTheDocument();
    expect(screen.getByText(/external timestamp when available/)).toBeInTheDocument();
    expect(screen.getByText(/access-controlled storage/)).toBeInTheDocument();
    expect(screen.queryByText(/AES-256/)).not.toBeInTheDocument();
    expect(screen.queryByText(/PAdES-LT/)).not.toBeInTheDocument();
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
