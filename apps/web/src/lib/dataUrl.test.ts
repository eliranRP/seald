import { describe, it, expect, vi } from 'vitest';
import { canvasToPngDataUrl, isPngDataUrl } from './dataUrl';

describe('dataUrl', () => {
  it('isPngDataUrl validates the PNG data-URL prefix', () => {
    expect(isPngDataUrl('data:image/png;base64,iVBORw0KG')).toBe(true);
    expect(isPngDataUrl('data:image/jpeg;base64,...')).toBe(false);
    expect(isPngDataUrl('')).toBe(false);
  });

  it('canvasToPngDataUrl delegates to canvas.toDataURL("image/png")', () => {
    const toDataURL = vi.fn().mockReturnValue('data:image/png;base64,STUB');
    const fake = { toDataURL } as unknown as HTMLCanvasElement;
    expect(canvasToPngDataUrl(fake)).toBe('data:image/png;base64,STUB');
    expect(toDataURL).toHaveBeenCalledWith('image/png');
  });
});
