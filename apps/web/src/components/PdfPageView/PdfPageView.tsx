import { forwardRef, useEffect, useRef, useState } from 'react';
import type { PdfPageViewProps } from './PdfPageView.types';
import { LoadingOverlay, PageCanvas, Placeholder, Spinner, Wrap } from './PdfPageView.styles';

/**
 * Renders a single page of a parsed PDF document into a canvas, scaled to
 * `width` CSS pixels. The backing canvas is sized by `devicePixelRatio` to
 * stay crisp on HiDPI displays while the CSS box stays in stable CSS pixels —
 * important because field coordinates are recorded in that same space.
 *
 * Re-renders the page any time `doc`, `pageNumber`, or `width` change, and
 * cancels in-flight render tasks on teardown so rapid page/width changes
 * don't paint stale frames over newer ones.
 */
export const PdfPageView = forwardRef<HTMLDivElement, PdfPageViewProps>((props, ref) => {
  const { doc, pageNumber, width, onRendered, ...rest } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  // True while a page is being fetched/rasterized. Flips to false once the
  // render task resolves so the overlay can reveal the finished canvas.
  const [rendering, setRendering] = useState<boolean>(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    setRendering(true);

    const run = async (): Promise<void> => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = width / baseViewport.width;
        const dpr = Math.min(
          typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1,
          2,
        );
        const viewport = page.getViewport({ scale: cssScale * dpr });
        const cssHeight = Math.round(baseViewport.height * cssScale);

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${String(width)}px`;
        canvas.style.height = `${String(cssHeight)}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Unable to acquire 2D context for PDF page canvas');
        }
        // pdfjs returns an object with .promise and .cancel; hold on to it
        // so an overlapping re-render (e.g. fast Next Page clicks) can abort
        // the in-flight paint instead of tearing.
        const task = page.render({ canvasContext: ctx, viewport, canvas });
        renderTask = task;
        await task.promise;
        if (cancelled) return;
        setHeight(cssHeight);
        setError(null);
        setRendering(false);
        onRendered?.({ width, height: cssHeight });
      } catch (err: unknown) {
        if (cancelled) return;
        // pdfjs throws a "RenderingCancelledException" when we cancel the
        // task intentionally — swallow it.
        const name = (err as { name?: string } | null)?.name;
        if (name === 'RenderingCancelledException') return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setRendering(false);
      }
    };

    run().catch(() => {
      // Surfaced already via setError inside run(); swallow the rejected
      // promise so unhandled-rejection warnings don't bubble up.
    });

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // Already settled — nothing to do.
        }
      }
    };
  }, [doc, pageNumber, width, onRendered]);

  // While the first page hasn't rasterized we don't yet know its exact height.
  // Without a reserved box, the Wrap collapses to 0px, which would (a) hide
  // the absolutely-positioned LoadingOverlay entirely and (b) make the parent
  // Paper container invisible during the multi-second render of a large PDF.
  // A proportional minHeight using a US-letter-ish aspect ratio (11/8.5 ≈ 1.3)
  // reserves a reasonable placeholder; once the real height is known it takes
  // over via the exact `height` style.
  const placeholderMinHeight = Math.round(width * 1.3);

  return (
    <Wrap
      {...rest}
      ref={ref}
      style={{
        width,
        ...(height !== null ? { height } : { minHeight: placeholderMinHeight }),
        ...(rest.style ?? {}),
      }}
      role="img"
      aria-label={`PDF page ${String(pageNumber)}`}
    >
      <PageCanvas ref={canvasRef} />
      {rendering && !error ? (
        <LoadingOverlay role="status" aria-live="polite" aria-label="Rendering page">
          <Spinner aria-hidden />
          <span>Rendering page {pageNumber}…</span>
        </LoadingOverlay>
      ) : null}
      {error ? (
        <Placeholder role="alert">Failed to render page: {error.message}</Placeholder>
      ) : null}
    </Wrap>
  );
});

PdfPageView.displayName = 'PdfPageView';
