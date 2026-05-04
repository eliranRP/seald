import { describe, it, expect, beforeEach, vi } from 'vitest';
import { imageFileToPdf } from './imageToPdf';

/**
 * jsdom doesn't render <img> from a data URL — width/height stay 0 and
 * the natural-size getters return 0, so the conversion util's
 * aspect-ratio math would be undefined. Stub `Image` with a constructor
 * that, the moment `src` is assigned, fires `onload` synchronously with
 * a deterministic 800x600 box. The util's branch we want to exercise is
 * "given a loaded image, embed it in a 1-page A4 PDF" — the image
 * decoder itself isn't ours to test.
 *
 * Note this is a setup detail of the unit harness, NOT a contract of
 * `imageFileToPdf` — production browsers decode the bytes for real.
 */
class StubImage {
  public width = 800;

  public height = 600;

  public naturalWidth = 800;

  public naturalHeight = 600;

  public onload: (() => void) | null = null;

  public onerror: ((err: unknown) => void) | null = null;

  private _src = '';

  set src(value: string) {
    this._src = value;
    // fire onload on the next microtask so the await in the util sees it
    queueMicrotask(() => {
      if (this.onload) this.onload();
    });
  }

  get src(): string {
    return this._src;
  }
}

beforeEach(() => {
  (globalThis as unknown as { Image: typeof StubImage }).Image = StubImage;
  // jspdf calls URL.createObjectURL when given a Blob in some paths; we
  // hand it a data URL via FileReader instead, so this stub is just a
  // safety net.
  if (typeof URL.createObjectURL !== 'function') {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () =>
      'blob:stub';
  }
});

function jpegFile(name = 'photo.jpg'): File {
  // 4-byte JFIF prelude is enough — the stub Image ignores the bytes.
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: 'image/jpeg' });
}

// A real, minimal 1x1 transparent PNG. jspdf's PNG path actually parses
// the bytes (it walks IHDR/IDAT chunks for color depth), so a 4-byte
// stub blows up with "Incomplete or corrupt PNG file". This is the
// canonical 67-byte 1x1 transparent PNG used by every "tiny PNG" demo.
const TINY_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x00, 0x00, 0xb5, 0x1c, 0x0c,
  0x02, 0x00, 0x00, 0x00, 0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0x60, 0x00, 0x02, 0x00,
  0x00, 0x05, 0x00, 0x01, 0xe2, 0x26, 0x05, 0x9b, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

function pngFile(name = 'shot.png'): File {
  return new File([TINY_PNG_BYTES], name, { type: 'image/png' });
}

async function readBytes(file: File): Promise<Uint8Array> {
  // jsdom's File.arrayBuffer() exists but jsdom's Blob slice arrayBuffer
  // doesn't always — read via FileReader for portability.
  const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      if (r instanceof ArrayBuffer) resolve(r);
      else reject(new Error('FileReader did not return ArrayBuffer'));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
  return new Uint8Array(buf);
}

describe('imageFileToPdf', () => {
  it('returns a PDF File whose first 5 bytes are "%PDF-"', async () => {
    const out = await imageFileToPdf(jpegFile('photo.jpg'));
    expect(out).toBeInstanceOf(File);
    expect(out.type).toBe('application/pdf');
    expect(out.name).toBe('photo.pdf');
    const bytes = await readBytes(out);
    const headStr = String.fromCharCode(...bytes.slice(0, 5));
    expect(headStr).toBe('%PDF-');
  });

  it('renames the file extension to .pdf preserving the base name', async () => {
    const out = await imageFileToPdf(jpegFile('IMG_0421.HEIC.jpg'));
    expect(out.name).toBe('IMG_0421.HEIC.pdf');
  });

  it('handles PNG input the same way', async () => {
    const out = await imageFileToPdf(pngFile('signature.png'));
    expect(out.type).toBe('application/pdf');
    expect(out.name).toBe('signature.pdf');
  });

  it('rejects when the image fails to decode', async () => {
    class FailImage extends StubImage {
      override set src(_value: string) {
        queueMicrotask(() => {
          if (this.onerror) this.onerror(new Error('decode failed'));
        });
      }
    }
    (globalThis as unknown as { Image: typeof StubImage }).Image = FailImage;
    await expect(imageFileToPdf(jpegFile('broken.jpg'))).rejects.toThrow();
  });

  it('rejects non-image MIME types', async () => {
    const txt = new File([new Uint8Array([0x68, 0x69])], 'note.txt', { type: 'text/plain' });
    await expect(imageFileToPdf(txt)).rejects.toThrow(/image/i);
  });

  it('does not invoke fetch (purely client-side)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('fetch should not be called');
    });
    await imageFileToPdf(jpegFile('local.jpg'));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
