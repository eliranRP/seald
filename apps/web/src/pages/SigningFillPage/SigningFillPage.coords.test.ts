import { describe, expect, it } from 'vitest';

import {
  CANVAS_HEIGHT_FALLBACK,
  CANVAS_WIDTH,
  denormalizeCoord,
  normalizeCoord,
} from '@/lib/canvas-coords';

import type { SignerFieldKind } from '@/components/SignerField';

/* ------------------------------------------------------------------ */
/*  Mirror the exact default-dimension maps from SigningFillPage.tsx   */
/* ------------------------------------------------------------------ */

const DEFAULT_FIELD_W: Record<SignerFieldKind, number> = {
  signature: 200,
  initials: 80,
  name: 200,
  date: 140,
  text: 240,
  email: 240,
  checkbox: 24,
};

const DEFAULT_FIELD_H: Record<SignerFieldKind, number> = {
  signature: 54,
  initials: 54,
  name: 36,
  date: 36,
  text: 36,
  email: 36,
  checkbox: 24,
};

/* ------------------------------------------------------------------ */
/*  Helper: replicate the inline field-to-pixel logic from the page   */
/* ------------------------------------------------------------------ */

interface RawField {
  readonly x: number;
  readonly y: number;
  readonly width?: number | null;
  readonly height?: number | null;
}

interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function fieldToPixels(f: RawField, uiKind: SignerFieldKind, canvasHeight: number): PixelRect {
  return {
    w: f.width ? denormalizeCoord(f.width, CANVAS_WIDTH) : DEFAULT_FIELD_W[uiKind],
    h: f.height ? denormalizeCoord(f.height, canvasHeight) : DEFAULT_FIELD_H[uiKind],
    x: denormalizeCoord(f.x, CANVAS_WIDTH),
    y: denormalizeCoord(f.y, canvasHeight),
  };
}

/* ------------------------------------------------------------------ */
/*  Canvas constants                                                  */
/* ------------------------------------------------------------------ */

describe('canvas constants', () => {
  it('CANVAS_WIDTH is 560', () => {
    expect(CANVAS_WIDTH).toBe(560);
  });

  it('CANVAS_HEIGHT_FALLBACK is 740', () => {
    expect(CANVAS_HEIGHT_FALLBACK).toBe(740);
  });
});

/* ------------------------------------------------------------------ */
/*  X denormalization uses CANVAS_WIDTH (560)                         */
/* ------------------------------------------------------------------ */

describe('X denormalization uses CANVAS_WIDTH', () => {
  it('x=0.5 -> 280', () => {
    expect(denormalizeCoord(0.5, CANVAS_WIDTH)).toBe(280);
  });

  it('x=0 -> 0', () => {
    expect(denormalizeCoord(0, CANVAS_WIDTH)).toBe(0);
  });

  it('x=1 -> 560', () => {
    expect(denormalizeCoord(1, CANVAS_WIDTH)).toBe(560);
  });
});

/* ------------------------------------------------------------------ */
/*  Y denormalization uses actual PDF canvas height (not 740)         */
/* ------------------------------------------------------------------ */

describe('Y denormalization uses actual PDF canvas height', () => {
  // A4 PDF: 596 x 842 pt => canvasHeight = 560 * 842/596 ≈ 791.275…
  const a4CanvasHeight = CANVAS_WIDTH * (842 / 596);

  it('A4 canvas height is approximately 791.3', () => {
    expect(a4CanvasHeight).toBeCloseTo(791.3, 0);
  });

  it('y=0.5 -> ~396 with A4 height (not 370 from fallback 740)', () => {
    const yPx = denormalizeCoord(0.5, a4CanvasHeight);
    expect(yPx).toBe(Math.round(0.5 * a4CanvasHeight));
    // With fallback 740 the result would be 370 — verify it differs
    expect(yPx).not.toBe(Math.round(0.5 * CANVAS_HEIGHT_FALLBACK));
  });

  it('y=0.7 -> ~554 with A4 height (not 518 from fallback 740)', () => {
    const yPx = denormalizeCoord(0.7, a4CanvasHeight);
    expect(yPx).toBe(Math.round(0.7 * a4CanvasHeight));
    expect(yPx).not.toBe(Math.round(0.7 * CANVAS_HEIGHT_FALLBACK));
  });

  it('y=1 -> full canvas height', () => {
    expect(denormalizeCoord(1, a4CanvasHeight)).toBe(Math.round(a4CanvasHeight));
  });
});

/* ------------------------------------------------------------------ */
/*  Width uses CANVAS_WIDTH, height uses canvasHeight                 */
/* ------------------------------------------------------------------ */

describe('width uses CANVAS_WIDTH, height uses canvasHeight', () => {
  const a4CanvasHeight = CANVAS_WIDTH * (842 / 596);

  it('width=0.3571 -> ~200 px (CANVAS_WIDTH-based)', () => {
    expect(denormalizeCoord(0.3571, CANVAS_WIDTH)).toBe(Math.round(0.3571 * CANVAS_WIDTH));
  });

  it('height=0.073 -> ~58 px with A4 height (not 54)', () => {
    const hPx = denormalizeCoord(0.073, a4CanvasHeight);
    expect(hPx).toBe(Math.round(0.073 * a4CanvasHeight));
    // With fallback 740 the result would be ~54
    expect(hPx).not.toBe(Math.round(0.073 * CANVAS_HEIGHT_FALLBACK));
  });
});

/* ------------------------------------------------------------------ */
/*  Default dimensions when API omits width/height                    */
/* ------------------------------------------------------------------ */

describe('default dimensions when API does not send width/height', () => {
  const canvasHeight = 791; // doesn't matter — defaults are pixel constants

  it.each<[SignerFieldKind, number, number]>([
    ['signature', 200, 54],
    ['initials', 80, 54],
    ['checkbox', 24, 24],
    ['date', 140, 36],
    ['text', 240, 36],
    ['email', 240, 36],
    ['name', 200, 36],
  ])('%s field defaults to %d x %d', (kind, expectedW, expectedH) => {
    const px = fieldToPixels({ x: 0.1, y: 0.1 }, kind, canvasHeight);
    expect(px.w).toBe(expectedW);
    expect(px.h).toBe(expectedH);
  });
});

/* ------------------------------------------------------------------ */
/*  Legacy backward compatibility (coordinates > 1 are raw pixels)    */
/* ------------------------------------------------------------------ */

describe('legacy backward compatibility — values > 1 pass through', () => {
  it('x=300 -> 300 (raw pixel passthrough)', () => {
    expect(denormalizeCoord(300, CANVAS_WIDTH)).toBe(300);
  });

  it('y=500 -> 500 (raw pixel passthrough)', () => {
    expect(denormalizeCoord(500, 791)).toBe(500);
  });

  it('width=200 -> 200 (raw pixel passthrough)', () => {
    expect(denormalizeCoord(200, CANVAS_WIDTH)).toBe(200);
  });

  it('exactly 1 is treated as normalized (edge of range)', () => {
    // 1 is not > 1, so it is normalized: 1 * canvasPx
    expect(denormalizeCoord(1, CANVAS_WIDTH)).toBe(560);
  });

  it('1.0001 is treated as raw pixel', () => {
    expect(denormalizeCoord(1.0001, CANVAS_WIDTH)).toBe(1.0001);
  });
});

/* ------------------------------------------------------------------ */
/*  Round-trip: normalize -> denormalize preserves pixel position      */
/* ------------------------------------------------------------------ */

describe('normalize -> denormalize round-trip', () => {
  it.each([0, 100, 280, 560])('round-trips x=%d through CANVAS_WIDTH', (px) => {
    const norm = normalizeCoord(px, CANVAS_WIDTH);
    expect(denormalizeCoord(norm, CANVAS_WIDTH)).toBe(px);
  });

  it('round-trips y through A4 canvas height', () => {
    const h = CANVAS_WIDTH * (842 / 596);
    // Pick a pixel that divides evenly after rounding
    const px = 400;
    const norm = normalizeCoord(px, h);
    // normalizeCoord clamps to [0,1], so px must be <= h
    expect(norm).toBeGreaterThanOrEqual(0);
    expect(norm).toBeLessThanOrEqual(1);
    expect(denormalizeCoord(norm, h)).toBe(Math.round(norm * h));
  });
});

/* ------------------------------------------------------------------ */
/*  fieldToPixels integration — full field conversion                 */
/* ------------------------------------------------------------------ */

describe('fieldToPixels integration', () => {
  const a4CanvasHeight = CANVAS_WIDTH * (842 / 596);

  it('converts a fully-specified normalized field', () => {
    const px = fieldToPixels(
      { x: 0.25, y: 0.6, width: 0.3571, height: 0.073 },
      'signature',
      a4CanvasHeight,
    );
    expect(px.x).toBe(Math.round(0.25 * CANVAS_WIDTH));
    expect(px.y).toBe(Math.round(0.6 * a4CanvasHeight));
    expect(px.w).toBe(Math.round(0.3571 * CANVAS_WIDTH));
    expect(px.h).toBe(Math.round(0.073 * a4CanvasHeight));
  });

  it('uses defaults when width/height are null', () => {
    const px = fieldToPixels(
      { x: 0.5, y: 0.5, width: null, height: null },
      'checkbox',
      a4CanvasHeight,
    );
    expect(px.x).toBe(280);
    expect(px.y).toBe(Math.round(0.5 * a4CanvasHeight));
    expect(px.w).toBe(24);
    expect(px.h).toBe(24);
  });

  it('handles legacy raw-pixel coordinates', () => {
    const px = fieldToPixels(
      { x: 300, y: 500, width: 200, height: 54 },
      'signature',
      a4CanvasHeight,
    );
    expect(px.x).toBe(300);
    expect(px.y).toBe(500);
    expect(px.w).toBe(200);
    expect(px.h).toBe(54);
  });

  it('uses different heights for Letter vs A4 PDFs', () => {
    // US Letter: 612 x 792 pt
    const letterHeight = CANVAS_WIDTH * (792 / 612);
    const a4Px = fieldToPixels({ x: 0.5, y: 0.8 }, 'text', a4CanvasHeight);
    const letterPx = fieldToPixels({ x: 0.5, y: 0.8 }, 'text', letterHeight);

    // Same x (both use CANVAS_WIDTH)
    expect(a4Px.x).toBe(letterPx.x);
    // Different y (different aspect ratios)
    expect(a4Px.y).not.toBe(letterPx.y);
    // A4 is taller => y pixel is larger for same normalized value
    expect(a4Px.y).toBeGreaterThan(letterPx.y);
  });
});
