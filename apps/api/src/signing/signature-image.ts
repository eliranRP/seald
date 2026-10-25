import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

/**
 * Signature image normalization in pure JavaScript (AWS exit plan, WS-5).
 * Replaces sharp, a native addon the Supabase edge runtime cannot load.
 *
 * Same contract as the sharp pipeline it replaces: decode a PNG or JPEG,
 * scale it to fit inside the target box (enlarging small images too),
 * keep the aspect ratio, and encode a PNG. Signatures are small, so the
 * per-pixel work stays well under the edge function's CPU budget.
 */

/** Refuse to decode anything larger, so a tiny file cannot expand into a huge bitmap. */
export const MAX_SIGNATURE_PIXELS = 16_000_000;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface Rgba {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  readonly data: Uint8Array;
}

export class SignatureImageError extends Error {
  constructor(reason: string) {
    super(`signature_image_${reason}`);
  }
}

export function normalizeSignatureImage(
  input: Buffer,
  boxWidth: number,
  boxHeight: number,
): Buffer {
  const source = decode(input);
  const scale = Math.min(boxWidth / source.width, boxHeight / source.height);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const resized = resize(source, width, height);
  const png = new PNG({ width, height });
  png.data = Buffer.from(resized.data.buffer, resized.data.byteOffset, resized.data.byteLength);
  return PNG.sync.write(png, { deflateLevel: 9 });
}

function decode(input: Buffer): Rgba {
  if (input.length >= PNG_MAGIC.length && input.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    // IHDR sits right after the signature: 4-byte length, "IHDR", then width
    // and height. Check them before inflating the image data.
    if (input.length < 24) throw new SignatureImageError('unreadable');
    assertPixelBudget(input.readUInt32BE(16), input.readUInt32BE(20));
    let png: PNG;
    try {
      png = PNG.sync.read(input);
    } catch {
      throw new SignatureImageError('unreadable');
    }
    return { width: png.width, height: png.height, data: png.data };
  }
  let img: { width: number; height: number; data: Uint8Array };
  try {
    img = jpeg.decode(input, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: MAX_SIGNATURE_PIXELS / 1_000_000,
      maxMemoryUsageInMB: 256,
    });
  } catch {
    throw new SignatureImageError('unreadable');
  }
  assertPixelBudget(img.width, img.height);
  return img;
}

function assertPixelBudget(width: number, height: number): void {
  if (width === 0 || height === 0) throw new SignatureImageError('unreadable');
  if (width * height > MAX_SIGNATURE_PIXELS) throw new SignatureImageError('too_many_pixels');
}

/**
 * Area-average resample with premultiplied alpha. Each output pixel averages
 * the source area it covers (exact box coverage, fractional edges weighted),
 * which is a box filter when shrinking and nearest-area when enlarging.
 * Premultiplying keeps the transparent background of a drawn signature from
 * bleeding a dark fringe into the strokes.
 */
function resize(src: Rgba, width: number, height: number): Rgba {
  const out = new Uint8Array(width * height * 4);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let oy = 0; oy < height; oy++) {
    const y0 = oy * sy;
    const y1 = y0 + sy;
    for (let ox = 0; ox < width; ox++) {
      const x0 = ox * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let y = Math.floor(y0); y < Math.min(Math.ceil(y1), src.height); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0);
        for (let x = Math.floor(x0); x < Math.min(Math.ceil(x1), src.width); x++) {
          const w = wy * (Math.min(x + 1, x1) - Math.max(x, x0));
          const i = (y * src.width + x) * 4;
          const alpha = (src.data[i + 3] as number) / 255;
          r += (src.data[i] as number) * alpha * w;
          g += (src.data[i + 1] as number) * alpha * w;
          b += (src.data[i + 2] as number) * alpha * w;
          a += alpha * w;
          area += w;
        }
      }
      const o = (oy * width + ox) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = area > 0 ? Math.round((a / area) * 255) : 0;
    }
  }
  return { width, height, data: out };
}
