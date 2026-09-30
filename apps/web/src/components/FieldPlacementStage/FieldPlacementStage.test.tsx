import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { SealdThemeProvider } from '@/providers/SealdThemeProvider';
import { pageCanvasHeight } from '@/lib/canvas-coords';
import { FieldPlacementStage } from './FieldPlacementStage';

function mixedDoc(): PDFDocumentProxy {
  const pages = [
    { width: 612, height: 792 },
    { width: 612, height: 1008 },
  ];
  return {
    numPages: pages.length,
    getPage: vi.fn(async (pageNumber: number) => {
      const page = pages[pageNumber - 1];
      if (!page) throw new Error('missing page');
      return {
        getViewport: ({ scale }: { scale: number }) => ({
          width: page.width * scale,
          height: page.height * scale,
        }),
        render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
      };
    }),
  } as unknown as PDFDocumentProxy;
}

describe('FieldPlacementStage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sizes each page from its own viewport and places the box on that page', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({}) as CanvasRenderingContext2D,
    );
    const { container } = render(
      <SealdThemeProvider>
        <FieldPlacementStage
          pdfDoc={mixedDoc()}
          canvasWidth={560}
          surface="preview"
          fields={[
            {
              id: 'sig',
              kind: 'signature',
              page: 2,
              x: 0.2,
              y: 0.5,
              width: 0.25,
              height: 0.04,
            },
          ]}
        />
      </SealdThemeProvider>,
    );

    const letter = pageCanvasHeight(612, 792, 560);
    const legal = pageCanvasHeight(612, 1008, 560);
    await waitFor(() => {
      const page2 = container.querySelector('[data-surface="preview"][data-page="2"]');
      expect(page2).not.toBeNull();
      expect(Number.parseFloat((page2 as HTMLElement).style.height)).toBeCloseTo(legal, 4);
    });

    const page1 = container.querySelector('[data-surface="preview"][data-page="1"]') as HTMLElement;
    const page2 = container.querySelector('[data-surface="preview"][data-page="2"]') as HTMLElement;
    expect(Number.parseFloat(page1.style.height)).toBeCloseTo(letter, 4);
    expect(legal - letter).toBeGreaterThan(100);

    const box = page2.querySelector('[data-field-kind="signature"]') as HTMLElement;
    expect(Number.parseFloat(box.style.left)).toBeCloseTo(0.2 * 560, 4);
    expect(Number.parseFloat(box.style.top)).toBeCloseTo(0.5 * legal, 4);
    expect(page1.querySelector('[data-field-kind="signature"]')).toBeNull();
  });
});
