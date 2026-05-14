import { describe, expect, it } from 'vitest';

import { CANVAS_WIDTH, computeCanvasWidth } from './canvas-coords';

/**
 * `computeCanvasWidth(viewportWidth)` is the single source of truth for the
 * signing-screen canvas width — desktop holds at the original 560 px so
 * field coordinates stored against that grid keep rendering pixel-for-pixel,
 * while small viewports shrink to (viewportWidth - 32) so a 375 px iPhone
 * no longer needs a two-finger pan to reach the right-hand fields
 * (audit report-B-signer.md, SigningFillPage [HIGH] mobile canvas overflow).
 */
describe('computeCanvasWidth', () => {
  it('returns CANVAS_WIDTH on a 1440 px desktop viewport', () => {
    expect(computeCanvasWidth(1440)).toBe(CANVAS_WIDTH);
  });

  it('returns CANVAS_WIDTH at the desktop breakpoint (>= 769 px)', () => {
    expect(computeCanvasWidth(769)).toBe(CANVAS_WIDTH);
  });

  it('shrinks to viewportWidth - 32 on a 375 px iPhone viewport', () => {
    // 375 - 32 = 343. The canvas must fit inside the viewport so no
    // field at x > viewportWidth is hidden off-screen.
    expect(computeCanvasWidth(375)).toBe(343);
    expect(computeCanvasWidth(375)).toBeLessThanOrEqual(375);
  });

  it('never exceeds CANVAS_WIDTH (caps tiny tablets at the desktop value)', () => {
    expect(computeCanvasWidth(768)).toBeLessThanOrEqual(CANVAS_WIDTH);
  });

  it('handles a 320 px (iPhone SE) viewport without going negative', () => {
    const w = computeCanvasWidth(320);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThanOrEqual(320);
  });
});
