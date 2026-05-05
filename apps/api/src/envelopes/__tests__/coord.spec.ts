import { clampUnit, denormalizeRect, flipYForPdfLib, normalizeRect, roundCoord } from '../coord';

describe('coord', () => {
  describe('roundCoord', () => {
    it('rounds to 4 decimals', () => {
      expect(roundCoord(0.123456789)).toBe(0.1235);
      expect(roundCoord(0.00005)).toBe(0.0001);
      expect(roundCoord(1)).toBe(1);
    });
  });

  describe('clampUnit', () => {
    it('clamps negatives to 0', () => {
      expect(clampUnit(-0.5)).toBe(0);
    });
    it('clamps >1 to 1', () => {
      expect(clampUnit(1.5)).toBe(1);
    });
    it('passes through valid values', () => {
      expect(clampUnit(0)).toBe(0);
      expect(clampUnit(1)).toBe(1);
      expect(clampUnit(0.5)).toBe(0.5);
    });
  });

  describe('normalizeRect', () => {
    it('normalizes a pixel rect against a page', () => {
      const out = normalizeRect(
        { x: 100, y: 200, width: 50, height: 25 },
        { width: 1000, height: 500 },
      );
      expect(out).toEqual({ x: 0.1, y: 0.4, width: 0.05, height: 0.05 });
    });

    it('handles null width/height', () => {
      const out = normalizeRect(
        { x: 100, y: 200, width: null, height: null },
        { width: 1000, height: 500 },
      );
      expect(out).toEqual({ x: 0.1, y: 0.4, width: null, height: null });
    });

    it('clamps overflow values', () => {
      const out = normalizeRect({ x: 2000, y: -100 }, { width: 1000, height: 500 });
      expect(out.x).toBe(1);
      expect(out.y).toBe(0);
    });

    it('rounds to 4 decimals', () => {
      const out = normalizeRect({ x: 333, y: 334 }, { width: 1000, height: 1000 });
      expect(out.x).toBe(0.333);
      expect(out.y).toBe(0.334);
    });

    it('throws on invalid page dimensions', () => {
      expect(() => normalizeRect({ x: 1, y: 1 }, { width: 0, height: 100 })).toThrow(
        /invalid_page_dimensions/,
      );
      expect(() => normalizeRect({ x: 1, y: 1 }, { width: 100, height: -1 })).toThrow(
        /invalid_page_dimensions/,
      );
    });
  });

  describe('denormalizeRect', () => {
    it('inverts normalizeRect', () => {
      const page = { width: 1000, height: 500 };
      const pixel = { x: 123, y: 456, width: 78, height: 90 };
      const roundTrip = denormalizeRect(normalizeRect(pixel, page), page);
      expect(Math.round(roundTrip.x)).toBe(pixel.x);
      expect(Math.round(roundTrip.y)).toBe(pixel.y);
      expect(Math.round(roundTrip.width!)).toBe(pixel.width);
      expect(Math.round(roundTrip.height!)).toBe(pixel.height);
    });

    it('preserves null width/height', () => {
      const out = denormalizeRect(
        { x: 0.1, y: 0.2, width: null, height: null },
        { width: 1000, height: 500 },
      );
      expect(out.width).toBe(null);
      expect(out.height).toBe(null);
    });

    it('throws on invalid page dimensions', () => {
      expect(() =>
        denormalizeRect({ x: 0.1, y: 0.2, width: null, height: null }, { width: 0, height: 100 }),
      ).toThrow(/invalid_page_dimensions/);
    });
  });

  describe('flipYForPdfLib', () => {
    it('maps top-left origin y to bottom-left origin y in pixel space', () => {
      // top-left y = 0 (top of page) — pdf-lib y should be page_h - 0 - 0 = page_h
      expect(flipYForPdfLib(0, 0, 500)).toBe(500);
      // top-left y = 1 (bottom of page) — pdf-lib y should be 0
      expect(flipYForPdfLib(1, 0, 500)).toBe(0);
      // field at top-left 0.25 with height 0.1 on a 500 tall page:
      //   pdf-lib y = 500 * (1 - 0.25 - 0.1) = 325
      expect(flipYForPdfLib(0.25, 0.1, 500)).toBe(325);
    });

    it('treats null height as 0', () => {
      expect(flipYForPdfLib(0.25, null, 500)).toBe(375);
    });
  });
});
