import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SealdThemeProvider } from '../../providers/SealdThemeProvider';
import { PdfPageView } from './PdfPageView';
import type { PDFDocumentProxy } from '../../lib/pdf';

interface FakeViewport {
  readonly width: number;
  readonly height: number;
}

/**
 * Build a minimal `PDFDocumentProxy` lookalike so the component can be
 * exercised in jsdom without an actual PDF/worker. We only assert on the
 * wrapper aria-label and size — the canvas pixel output is untestable in
 * jsdom anyway.
 */
function fakeDoc(getContext2D: (() => CanvasRenderingContext2D | null) | null): PDFDocumentProxy {
  const getPage = async (): Promise<unknown> => ({
    getViewport: ({ scale }: { readonly scale: number }): FakeViewport => ({
      width: 400 * scale,
      height: 600 * scale,
    }),
    render: (): { readonly promise: Promise<void>; readonly cancel: () => void } => ({
      promise: Promise.resolve(),
      cancel: () => {},
    }),
  });
  const doc = { numPages: 3, getPage, destroy: async () => {} };
  if (getContext2D) {
    // Swap the prototype method so canvas.getContext('2d') returns our stub
    // (jsdom returns null by default, which our component treats as an error).
    // Restoring is handled by vi.restoreAllMocks in the test's afterEach.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => getContext2D());
  }
  return doc as unknown as PDFDocumentProxy;
}

describe('PdfPageView', () => {
  it('renders a wrapper with an accessible label for the page', async () => {
    const doc = fakeDoc(() => ({}) as unknown as CanvasRenderingContext2D);
    render(
      <SealdThemeProvider>
        <PdfPageView doc={doc} pageNumber={2} width={320} />
      </SealdThemeProvider>,
    );
    expect(screen.getByRole('img', { name: /pdf page 2/i })).toBeInTheDocument();
  });

  it('calls onRendered once the page paints with the computed CSS size', async () => {
    const doc = fakeDoc(() => ({}) as unknown as CanvasRenderingContext2D);
    const onRendered = vi.fn();
    render(
      <SealdThemeProvider>
        <PdfPageView doc={doc} pageNumber={1} width={400} onRendered={onRendered} />
      </SealdThemeProvider>,
    );
    await waitFor(() => {
      expect(onRendered).toHaveBeenCalledTimes(1);
    });
    expect(onRendered).toHaveBeenCalledWith({ width: 400, height: 600 });
  });

  it('surfaces a readable error when the 2D context cannot be obtained', async () => {
    const doc = fakeDoc(() => null);
    render(
      <SealdThemeProvider>
        <PdfPageView doc={doc} pageNumber={1} width={320} />
      </SealdThemeProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to render/i);
    });
  });
});
