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
    const { getByText } = renderWithTheme(
      <DocumentPageCanvas pageNum={1} totalPages={1}>
        <span style={{ position: 'absolute', left: 10, top: 10 }}>field-layer-child</span>
      </DocumentPageCanvas>,
    );
    expect(getByText('field-layer-child')).toBeInTheDocument();
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

  // Regression: signing rendered fields with absolute coords from the
  // editor (0..560 × 0..740). The padded layout (56/64 padding) reduced
  // the effective PDF render area to 432×628 while fields were placed
  // at 0..560 — right-edge signatures fell outside the PDF. Without a
  // pdfSrc we must remain in the padded placeholder layout so the
  // demo/preview surface still has gutters.
  it('placeholder layout (no pdfSrc) reports data-pdf-mode="false"', () => {
    const { container } = renderWithTheme(<DocumentPageCanvas pageNum={1} totalPages={1} />);
    const page = container.querySelector('[data-r-page="1"]');
    expect(page?.getAttribute('data-pdf-mode')).toBe('false');
  });
});
