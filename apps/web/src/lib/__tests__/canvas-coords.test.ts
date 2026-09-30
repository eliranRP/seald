import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT_FALLBACK,
  normalizeCoord,
  denormalizeCoord,
  pageCanvasHeight,
  placeSignerField,
  useCanvasHeight,
  usePageCanvasHeights,
} from '@/lib/canvas-coords';
import type { PDFDocumentProxy } from 'pdfjs-dist';

describe('canvas-coords', () => {
  describe('CANVAS_WIDTH', () => {
    it('equals 560', () => {
      expect(CANVAS_WIDTH).toBe(560);
    });
  });

  describe('CANVAS_HEIGHT_FALLBACK', () => {
    it('equals 740', () => {
      expect(CANVAS_HEIGHT_FALLBACK).toBe(740);
    });
  });

  describe('normalizeCoord', () => {
    it('normalizes midpoint to 0.5', () => {
      expect(normalizeCoord(280, 560)).toBe(0.5);
    });

    it('normalizes 0 to 0', () => {
      expect(normalizeCoord(0, 560)).toBe(0);
    });

    it('normalizes full width to 1', () => {
      expect(normalizeCoord(560, 560)).toBe(1);
    });

    it('clamps values above canvas size to 1', () => {
      expect(normalizeCoord(700, 560)).toBe(1);
    });

    it('clamps negative values to 0', () => {
      expect(normalizeCoord(-10, 560)).toBe(0);
    });

    it('normalizes using a different canvas size', () => {
      expect(normalizeCoord(140, 740)).toBeCloseTo(0.189, 3);
    });
  });

  describe('denormalizeCoord', () => {
    it('denormalizes 0.5 to midpoint', () => {
      expect(denormalizeCoord(0.5, 560)).toBe(280);
    });

    it('denormalizes 0 to 0', () => {
      expect(denormalizeCoord(0, 560)).toBe(0);
    });

    it('denormalizes 1 to full width', () => {
      expect(denormalizeCoord(1, 560)).toBe(560);
    });

    it('rounds to nearest integer', () => {
      expect(denormalizeCoord(0.333, 740)).toBe(246);
    });

    it('passes through legacy pixel values greater than 1', () => {
      expect(denormalizeCoord(300, 560)).toBe(300);
    });

    it('passes through legacy fractional pixel values greater than 1', () => {
      expect(denormalizeCoord(1.5, 560)).toBe(1.5);
    });

    it('can skip whole-pixel rounding', () => {
      expect(denormalizeCoord(0.333, 740, { round: false })).toBe(0.333 * 740);
    });
  });

  describe('pageCanvasHeight', () => {
    it('sizes each page from its own viewport', () => {
      const letter = pageCanvasHeight(612, 792, CANVAS_WIDTH);
      const legal = pageCanvasHeight(612, 1008, CANVAS_WIDTH);
      expect(letter).toBeCloseTo(CANVAS_WIDTH * (792 / 612), 5);
      expect(legal - letter).toBeCloseTo(CANVAS_WIDTH * ((1008 - 792) / 612), 5);
    });
  });

  describe('placeSignerField', () => {
    const defaults = { w: 200, h: 54 };

    it('places the same fraction at different pixel rows on Letter and Legal', () => {
      const letterH = pageCanvasHeight(612, 792, CANVAS_WIDTH);
      const legalH = pageCanvasHeight(612, 1008, CANVAS_WIDTH);
      const onLetter = placeSignerField(
        { x: 0.25, y: 0.5, width: 0.2, height: 0.04 },
        defaults,
        CANVAS_WIDTH,
        letterH,
      );
      const onLegal = placeSignerField(
        { x: 0.25, y: 0.5, width: 0.2, height: 0.04 },
        defaults,
        CANVAS_WIDTH,
        legalH,
      );
      expect(onLetter.y).toBeCloseTo(0.5 * letterH, 5);
      expect(onLegal.y).toBeCloseTo(0.5 * legalH, 5);
      expect(onLegal.y - onLetter.y).toBeGreaterThan(90);
      expect(onLegal.y).not.toBe(Math.round(onLegal.y));
    });
  });

  describe('usePageCanvasHeights', () => {
    function makeMixedDoc() {
      const pages = [
        { width: 612, height: 792 },
        { width: 595.28, height: 841.89 },
        { width: 612, height: 1008 },
      ];
      return {
        numPages: pages.length,
        getPage: vi.fn(async (pageNumber: number) => ({
          getViewport: ({ scale }: { scale: number }) => {
            const page = pages[pageNumber - 1];
            if (!page) throw new Error('missing page');
            return { width: page.width * scale, height: page.height * scale };
          },
        })),
      } as unknown as PDFDocumentProxy;
    }

    it('returns a distinct height for each page', async () => {
      const pdfDoc = makeMixedDoc();
      const { result } = renderHook(() => usePageCanvasHeights(pdfDoc, CANVAS_WIDTH));
      await waitFor(() => {
        expect(result.current.size).toBe(3);
      });
      const letter = pageCanvasHeight(612, 792, CANVAS_WIDTH);
      const a4 = pageCanvasHeight(595.28, 841.89, CANVAS_WIDTH);
      const legal = pageCanvasHeight(612, 1008, CANVAS_WIDTH);
      expect(result.current.get(1)).toBeCloseTo(letter, 5);
      expect(result.current.get(2)).toBeCloseTo(a4, 5);
      expect(result.current.get(3)).toBeCloseTo(legal, 5);
      expect(result.current.get(3)).not.toBeCloseTo(letter, 0);
    });
  });

  describe('useCanvasHeight', () => {
    function makePdfDoc(pageWidth: number, pageHeight: number) {
      return {
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getViewport: ({ scale }: { scale: number }) => ({
            width: pageWidth * scale,
            height: pageHeight * scale,
          }),
        }),
      } as unknown as PDFDocumentProxy;
    }

    it('returns CANVAS_HEIGHT_FALLBACK when pdfDoc is null', () => {
      const { result } = renderHook(() => useCanvasHeight(null));
      expect(result.current).toBe(CANVAS_HEIGHT_FALLBACK);
    });

    it('computes height from PDF page viewport', async () => {
      const pdfDoc = makePdfDoc(596, 842);
      const { result } = renderHook(() => useCanvasHeight(pdfDoc));

      await waitFor(() => {
        expect(result.current).toBeCloseTo(CANVAS_WIDTH * (842 / 596), 1);
      });
    });

    it('updates height when pdfDoc changes from null to a real doc', async () => {
      const pdfDoc = makePdfDoc(596, 842);

      const { result, rerender } = renderHook(
        ({ doc }: { doc: PDFDocumentProxy | null | undefined }) => useCanvasHeight(doc),
        { initialProps: { doc: null as PDFDocumentProxy | null | undefined } },
      );

      expect(result.current).toBe(CANVAS_HEIGHT_FALLBACK);

      rerender({ doc: pdfDoc });

      await waitFor(() => {
        expect(result.current).toBeCloseTo(CANVAS_WIDTH * (842 / 596), 1);
      });
    });
  });
});
