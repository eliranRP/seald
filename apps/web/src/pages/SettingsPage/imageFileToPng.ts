/** Largest source image the signature upload accepts. */
export const SIGNATURE_UPLOAD_MAX_BYTES = 1_000_000;
const OUT_W = 600;
const OUT_H = 200;

/**
 * Turns a PNG or JPG into a PNG data URL no bigger than 600 x 200, keeping
 * the aspect ratio. Returns null for a wrong type, a file over 1 MB, or an
 * image the browser cannot decode.
 */
export async function imageFileToPng(file: File): Promise<string | null> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) return null;
  if (file.size > SIGNATURE_UPLOAD_MAX_BYTES) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode'));
      el.src = url;
    });
    const scale = Math.min(OUT_W / img.width, OUT_H / img.height, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
