import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { DocumentPageCanvas } from './DocumentPageCanvas';

describe('DocumentPageCanvas', () => {
  it('renders the title and page tag', () => {
    const { getByText } = renderWithTheme(
      <DocumentPageCanvas pageNum={1} totalPages={3} title="Master Services Agreement" />,
    );
    expect(getByText('Master Services Agreement')).toBeInTheDocument();
    expect(getByText('Page 1 of 3')).toBeInTheDocument();
  });

  it('renders children inside the field layer', () => {
    const { getByTestId } = renderWithTheme(
      <DocumentPageCanvas pageNum={1} totalPages={1}>
        <span data-testid="field-child" style={{ position: 'absolute', left: 10, top: 10 }}>
          x
        </span>
      </DocumentPageCanvas>,
    );
    expect(getByTestId('field-child')).toBeInTheDocument();
  });

  it('adds data-r-page for scroll targeting', () => {
    const { container } = renderWithTheme(<DocumentPageCanvas pageNum={2} totalPages={3} />);
    expect(container.querySelector('[data-r-page="2"]')).not.toBeNull();
  });

  it('renders placeholder bars when no pdfSrc is provided', () => {
    const { container } = renderWithTheme(<DocumentPageCanvas pageNum={1} totalPages={1} />);
    const lines = container.querySelectorAll('[data-placeholder-bar="true"]');
    expect(lines.length).toBe(12);
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(<DocumentPageCanvas pageNum={1} totalPages={1} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root page', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<DocumentPageCanvas ref={ref} pageNum={1} totalPages={1} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
