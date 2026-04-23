import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the title as an h1', () => {
    renderWithTheme(<PageHeader title="Everything you've sent" />);
    expect(
      screen.getByRole('heading', { level: 1, name: /everything you've sent/i }),
    ).toBeInTheDocument();
  });

  it('renders the eyebrow when supplied', () => {
    renderWithTheme(<PageHeader eyebrow="Documents" title="All documents" />);
    expect(screen.getByText('Documents')).toBeInTheDocument();
  });

  it('renders an actions slot', () => {
    renderWithTheme(<PageHeader title="Stuff" actions={<button type="button">New</button>} />);
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<PageHeader ref={ref} title="x" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<PageHeader eyebrow="Documents" title="All documents" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
