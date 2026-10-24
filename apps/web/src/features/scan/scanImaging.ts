import { applyScanFilter, type ScanFilter } from './imageFilters';

/**
 * Browser-only image steps for the scanner (canvas and decoded bitmaps).
 * The pixel maths is in `imageFilters.ts`; this file only moves pixels in
 * and out of canvases, so tests mock it.
 */

/** Longest edge kept for a captured page; plenty for a legible A4 scan. */
const MAX_EDGE = 1800;
const JPEG_QUALITY = 0.88;

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });
}

function fit(width: number, height: number, maxEdge: number): { w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

function canvasOf(
  w: number,
  h: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas_unavailable');
  return { canvas, ctx };
}

/** One frame of the live camera, as a JPEG. */
export async function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const { w, h } = fit(video.videoWidth, video.videoHeight, MAX_EDGE);
  const { canvas, ctx } = canvasOf(w, h);
  ctx.drawImage(video, 0, 0, w, h);
  return toBlob(canvas);
}

/** A photo picked from the gallery, shrunk to the same size as a capture. */
export async function normalizePhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { w, h } = fit(bitmap.width, bitmap.height, MAX_EDGE);
    const { canvas, ctx } = canvasOf(w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await toBlob(canvas);
  } finally {
    bitmap.close();
  }
}

/** The page with a filter applied. `maxEdge` makes thumbnails cheap. */
export async function renderFiltered(
  source: Blob,
  filter: ScanFilter,
  maxEdge: number = MAX_EDGE,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  try {
    const { w, h } = fit(bitmap.width, bitmap.height, maxEdge);
    const { canvas, ctx } = canvasOf(w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (filter !== 'color') {
      const image = ctx.getImageData(0, 0, w, h);
      applyScanFilter(image.data, filter);
      ctx.putImageData(image, 0, 0);
    }
    return await toBlob(canvas);
  } finally {
    bitmap.close();
  }
}
