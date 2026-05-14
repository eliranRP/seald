import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { DocumentPageCanvas } from './DocumentPageCanvas';

const pdfMock = vi.hoisted(() => {
  type Viewport = { width: number; height: number };
  const render = vi.fn().mockReturnValue({ promise: Promise.resolve() });
  const getViewport = vi.fn(
    ({ scale }: { scale: number }): Viewport => ({
      width: 800 * scale,
      height: 1000 * scale,
    }),
  );
  const getPage = vi.fn().mockResolvedValue({ getViewport, render });
  return {
    render,
    getViewport,
    getPage,
    useResult: { doc: { getPage }, numPages: 1, loading: false, error: null },
  };
});

vi.mock('@/lib/pdf', () => ({
  usePdfDocument: () => pdfMock.useResult,
}));

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

  // Regression: on retina (dpr ≥ 2) the canvas backing store was sized at
  // CSS pixels, so the browser upscaled the rasterised page and signing
  // text rendered blurry. The fix scales the viewport by devicePixelRatio
  // (capped at 2) so the bitmap is 1:1 with device pixels.
  describe('retina-sharp render', () => {
    const originalDpr = window.devicePixelRatio;
    // jsdom returns null from canvas.getContext('2d') by default, which makes
    // the component bail before calling page.render(). Stub it with a no-op
    // 2D context so the render path actually runs.
    const fakeCtx = {} as CanvasRenderingContext2D;

    beforeEach(() => {
      pdfMock.getPage.mockClear();
      pdfMock.getViewport.mockClear();
      pdfMock.render.mockClear();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fakeCtx);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      Object.defineProperty(window, 'devicePixelRatio', {
        value: originalDpr,
        configurable: true,
      });
    });

    function setDpr(value: number): void {
      Object.defineProperty(window, 'devicePixelRatio', {
        value,
        configurable: true,
      });
    }

    it('renders at scale × dpr on a 2× display', async () => {
      setDpr(2);
      const { container } = renderWithTheme(
        <DocumentPageCanvas pageNum={1} totalPages={1} pdfSrc="x.pdf" width={560} />,
      );
      await waitFor(() => expect(pdfMock.render).toHaveBeenCalled());

      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
      // baseScale = 560 / 800 = 0.7; with dpr=2 the canvas bitmap is 0.7×2×800 = 1120
      expect(canvas?.width).toBe(1120);
      expect(canvas?.height).toBe(1400);

      const lastCall = pdfMock.getViewport.mock.calls.at(-1)?.[0];
      expect(lastCall?.scale).toBeCloseTo(1.4, 5);
    });

    it('caps dpr at 2 even on a 3× display', async () => {
      setDpr(3);
      const { container } = renderWithTheme(
        <DocumentPageCanvas pageNum={1} totalPages={1} pdfSrc="x.pdf" width={560} />,
      );
      await waitFor(() => expect(pdfMock.render).toHaveBeenCalled());

      const canvas = container.querySelector('canvas');
      expect(canvas?.width).toBe(1120);
      expect(canvas?.height).toBe(1400);
    });

    it('falls back to scale × 1 on a non-retina display', async () => {
      setDpr(1);
      const { container } = renderWithTheme(
        <DocumentPageCanvas pageNum={1} totalPages={1} pdfSrc="x.pdf" width={560} />,
      );
      await waitFor(() => expect(pdfMock.render).toHaveBeenCalled());

      const canvas = container.querySelector('canvas');
      expect(canvas?.width).toBe(560);
      expect(canvas?.height).toBe(700);
    });
  });
});
