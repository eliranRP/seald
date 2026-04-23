/** Returns true when `s` is a PNG data URL (`data:image/png;base64,…`). */
export function isPngDataUrl(s: string): boolean {
  return /^data:image\/png;base64,/.test(s);
}

/** Exports a canvas to a PNG data URL. */
export function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}
