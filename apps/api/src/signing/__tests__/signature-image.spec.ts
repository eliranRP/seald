import sharp from 'sharp';
import { PNG } from 'pngjs';
import {
  MAX_SIGNATURE_PIXELS,
  SignatureImageError,
  normalizeSignatureImage,
} from '../signature-image';

/**
 * The pure-JS normalizer replaced sharp (AWS exit plan, WS-5). sharp stays a
 * dev dependency so these tests can hold the new output to sharp's
 * `resize(600, 200, { fit: 'inside' })` contract.
 */

const BOX_W = 600;
const BOX_H = 200;

/** A transparent canvas with one opaque black bar across the middle. */
function strokePng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  png.data.fill(0);
  const top = Math.floor(height * 0.4);
  const bottom = Math.ceil(height * 0.6);
  for (let y = top; y < bottom; y++) {
    for (let x = Math.floor(width * 0.1); x < Math.ceil(width * 0.9); x++) {
      png.data[(y * width + x) * 4 + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

async function sharpSize(input: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(
    await sharp(input)
      .resize(BOX_W, BOX_H, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer(),
  ).metadata();
  return { width: meta.width ?? 0, height: meta.height ?? 0 };
}

describe('normalizeSignatureImage', () => {
  it.each([
    [1200, 400],
    [300, 100],
    [32, 16],
    [800, 800],
    [1001, 333],
  ])(
    'matches sharp fit-inside dimensions for a %ix%i PNG',
    async (w, h) => {
      const input = strokePng(w, h);
      const out = PNG.sync.read(normalizeSignatureImage(input, BOX_W, BOX_H));
      expect({ width: out.width, height: out.height }).toEqual(await sharpSize(input));
      // sharp (the reference, not the code under test) can be slow to start
      // when the full suite runs in parallel.
    },
    30_000,
  );

  it('keeps transparency and the stroke after a downscale', () => {
    const out = PNG.sync.read(normalizeSignatureImage(strokePng(1200, 400), BOX_W, BOX_H));
    const alphaAt = (x: number, y: number) => out.data[(y * out.width + x) * 4 + 3];
    expect(alphaAt(2, 2)).toBe(0);
    expect(alphaAt(300, 100)).toBe(255);
    // No dark fringe: an opaque stroke pixel next to transparency stays black.
    expect(out.data[(100 * out.width + 300) * 4]).toBe(0);
  });

  it('decodes a JPEG and always writes a PNG', async () => {
    const jpeg = await sharp({
      create: { width: 64, height: 32, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .jpeg()
      .toBuffer();
    const out = normalizeSignatureImage(jpeg, BOX_W, BOX_H);
    expect(out.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const png = PNG.sync.read(out);
    expect({ width: png.width, height: png.height }).toEqual({ width: 400, height: 200 });
    expect(png.data[0]).toBeGreaterThan(245);
  });

  it('rejects corrupt bytes behind a PNG signature', () => {
    const corrupt = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('not a real PNG body, just text padding the header out'),
    ]);
    expect(() => normalizeSignatureImage(corrupt, BOX_W, BOX_H)).toThrow(SignatureImageError);
  });

  it('refuses a PNG whose header claims more pixels than the budget, before inflating', () => {
    const png = strokePng(4, 4);
    const forged = Buffer.from(png);
    forged.writeUInt32BE(50_000, 16);
    forged.writeUInt32BE(50_000, 20);
    expect(50_000 * 50_000).toBeGreaterThan(MAX_SIGNATURE_PIXELS);
    expect(() => normalizeSignatureImage(forged, BOX_W, BOX_H)).toThrow(
      'signature_image_too_many_pixels',
    );
  });
});
