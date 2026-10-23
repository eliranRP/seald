/**
 * Page filters for a scan. Pure pixel maths over RGBA bytes so they can be
 * tested without a canvas. `rgba` is mutated in place and returned.
 *
 * - `color`: untouched.
 * - `document`: stretches the tonal range (2nd to 98th luminance percentile)
 *   so paper reads white and ink reads dark, and keeps the colour.
 * - `bw`: greyscale, then a hard black/white cut at Otsu's threshold.
 */
export type ScanFilter = 'document' | 'color' | 'bw';

export const SCAN_FILTERS: ReadonlyArray<{ readonly value: ScanFilter; readonly label: string }> = [
  { value: 'document', label: 'Document' },
  { value: 'color', label: 'Color' },
  { value: 'bw', label: 'B/W' },
];

function luma(r: number, g: number, b: number): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

function histogram(rgba: Uint8ClampedArray): Uint32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < rgba.length; i += 4) {
    const bin = luma(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0);
    hist[bin] = (hist[bin] ?? 0) + 1;
  }
  return hist;
}

function percentile(hist: Uint32Array, total: number, fraction: number): number {
  const target = total * fraction;
  let seen = 0;
  for (let level = 0; level < 256; level++) {
    seen += hist[level] ?? 0;
    if (seen >= target) return level;
  }
  return 255;
}

/** Otsu's method: the cut that best separates dark ink from light paper. */
export function otsuThreshold(hist: Uint32Array, total: number): number {
  let sumAll = 0;
  for (let level = 0; level < 256; level++) sumAll += level * (hist[level] ?? 0);
  let weightBack = 0;
  let sumBack = 0;
  let best = 0;
  let bestVariance = -1;
  for (let level = 0; level < 256; level++) {
    weightBack += hist[level] ?? 0;
    if (weightBack === 0) continue;
    const weightFore = total - weightBack;
    if (weightFore === 0) break;
    sumBack += level * (hist[level] ?? 0);
    const meanBack = sumBack / weightBack;
    const meanFore = (sumAll - sumBack) / weightFore;
    const variance = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = level;
    }
  }
  return best;
}

export function applyScanFilter(rgba: Uint8ClampedArray, mode: ScanFilter): Uint8ClampedArray {
  if (mode === 'color' || rgba.length === 0) return rgba;
  const total = rgba.length / 4;
  const hist = histogram(rgba);

  if (mode === 'bw') {
    const cut = otsuThreshold(hist, total);
    for (let i = 0; i < rgba.length; i += 4) {
      const v = luma(rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0) > cut ? 255 : 0;
      rgba[i] = v;
      rgba[i + 1] = v;
      rgba[i + 2] = v;
    }
    return rgba;
  }

  const low = percentile(hist, total, 0.02);
  const high = percentile(hist, total, 0.98);
  if (high - low < 8) return rgba;
  const scale = 255 / (high - low);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = (((rgba[i] ?? 0) - low) * scale) | 0;
    rgba[i + 1] = (((rgba[i + 1] ?? 0) - low) * scale) | 0;
    rgba[i + 2] = (((rgba[i + 2] ?? 0) - low) * scale) | 0;
  }
  return rgba;
}
