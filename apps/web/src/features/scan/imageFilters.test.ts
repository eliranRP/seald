import { describe, expect, it } from 'vitest';
import { applyScanFilter, otsuThreshold } from './imageFilters';

/** A page that is mostly grey paper (200) with some dark ink (40). */
function page(): Uint8ClampedArray {
  const px = new Uint8ClampedArray(100 * 4);
  for (let i = 0; i < 100; i++) {
    const ink = i < 10;
    const v = ink ? 40 : 200;
    px.set([v, v, v, 255], i * 4);
  }
  return px;
}

describe('applyScanFilter', () => {
  it('color leaves the pixels alone', () => {
    const before = page();
    const after = applyScanFilter(page(), 'color');
    expect(Array.from(after)).toEqual(Array.from(before));
  });

  it('bw cuts to pure black and white between ink and paper', () => {
    const out = applyScanFilter(page(), 'bw');
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(out.slice(40, 44))).toEqual([255, 255, 255, 255]);
    for (let i = 0; i < out.length; i += 4) expect([0, 255]).toContain(out[i]);
  });

  it('document stretches paper towards white and ink towards black', () => {
    const out = applyScanFilter(page(), 'document');
    expect(out[40]).toBeGreaterThan(240);
    expect(out[0]).toBeLessThan(15);
    expect(out[3]).toBe(255);
  });

  it('document leaves a flat image alone instead of amplifying noise', () => {
    const flat = new Uint8ClampedArray(40).fill(128);
    expect(Array.from(applyScanFilter(flat, 'document'))).toEqual(Array(40).fill(128));
  });

  it('handles an empty buffer', () => {
    expect(applyScanFilter(new Uint8ClampedArray(0), 'bw')).toHaveLength(0);
  });
});

describe('otsuThreshold', () => {
  it('lands between two clusters', () => {
    const hist = new Uint32Array(256);
    hist[40] = 10;
    hist[200] = 90;
    const cut = otsuThreshold(hist, 100);
    expect(cut).toBeGreaterThanOrEqual(40);
    expect(cut).toBeLessThan(200);
  });
});
