import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT_FALLBACK,
  normalizeCoord,
  denormalizeCoord,
  useCanvasHeight,
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
  });

  describe('useCanvasHeight', () => {
    function makePdfDoc(pageWidth: number, pageHeight: number) {
      return {
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
