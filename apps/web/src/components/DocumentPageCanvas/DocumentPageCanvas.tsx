import { forwardRef, useEffect, useRef, useState } from 'react';
import { usePdfDocument } from '@/lib/pdf';
import type { DocumentPageCanvasProps } from './DocumentPageCanvas.types';
import {
  FieldLayer,
  Heading,
  Line,
  Page,
  PageTag,
  PdfCanvas,
  PreviewWarning,
  Spacer,
} from './DocumentPageCanvas.styles';

const DEFAULT_WIDTH = 560;

function PlaceholderBars({ pageNum }: { readonly pageNum: number }) {
  // Deterministic pseudo-random widths so snapshots stay stable.
  const lines = Array.from({ length: 12 }, (_, i) => ({
    key: `bar-${pageNum}-${i}`,
    width: 70 + (((i + pageNum) * 7) % 30),
  }));
  return (
    <>
      {lines.map((line) => (
        <Line key={line.key} $width={line.width} data-placeholder-bar="true" />
      ))}
    </>
  );
}

/**
 * L2 component — white-paper page panel used as the canvas for the recipient
 * fill flow. When `pdfSrc` is provided and loads, the actual PDF page is
 * rendered via `pdfjs-dist`. On any failure — missing src, network error,
 * malformed PDF — we render placeholder bars plus a small inline warning so
 * signing remains usable (field coordinates are absolute and don't depend
 * on the rendered PDF).
 *
 * `children` render inside an absolute-positioned field layer so callers can
 * pass `SignatureField` instances with pixel coordinates.
 */
export const DocumentPageCanvas = forwardRef<HTMLDivElement, DocumentPageCanvasProps>(
  (props, ref) => {
    const {
      pageNum,
      totalPages,
      title = 'Document',
      width = DEFAULT_WIDTH,
      children,
      pdfSrc,
      ...rest
    } = props;

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const { doc, error, loading } = usePdfDocument(pdfSrc ?? null);
    const [renderError, setRenderError] = useState<Error | null>(null);

    useEffect(() => {
      if (!doc) return undefined;
      let cancelled = false;
      (async () => {
        try {
          const page = await doc.getPage(pageNum);
          if (cancelled) return;
          const scale = width / page.getViewport({ scale: 1 }).width;
          const viewport = page.getViewport({ scale });
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        } catch (err) {
          if (!cancelled) {
            setRenderError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [doc, pageNum, width]);

    const pdfFailed = Boolean(pdfSrc) && (error !== null || renderError !== null);
    const showPdf = Boolean(pdfSrc) && !pdfFailed;

    return (
      <Page ref={ref} $width={width} data-r-page={pageNum} {...rest}>
        <Heading>{title}</Heading>
        <PageTag>
          Page {pageNum} of {totalPages}
        </PageTag>
        <Spacer />

        {pdfFailed ? (
          <PreviewWarning role="status">
            Preview unavailable — you can still sign below.
          </PreviewWarning>
        ) : null}

        {showPdf && !loading ? (
          <PdfCanvas ref={canvasRef} aria-hidden="true" />
        ) : (
          <PlaceholderBars pageNum={pageNum} />
        )}

        <FieldLayer data-fields-layer={`page-${pageNum}`}>{children}</FieldLayer>
      </Page>
    );
  },
);
DocumentPageCanvas.displayName = 'DocumentPageCanvas';
