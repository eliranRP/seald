import { jsPDF } from 'jspdf';

/**
 * Client-side single-page image → PDF converter.
 *
 * Wired into the mobile send flow's "Take photo" tile so a phone-camera
 * JPEG/PNG ends up as a valid PDF that the existing pdf.js worker can
 * render and the existing send pipeline can transmit unchanged. We
 * deliberately avoid a server round-trip — the bytes never leave the
 * device until the user explicitly hits Send.
 *
 * Page sizing: A4 portrait (210 × 297 mm), 12 mm margins, image
 * letterboxed to preserve aspect ratio. Mobile photos are typically
 * ~3024×4032 (12 MP iPhone) so the result is one A4 page with the photo
 * filling most of the safe area.
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_MARGIN_MM = 12;

interface ImageDims {
  readonly width: number;
  readonly height: number;
  readonly dataUrl: string;
}

function isImageMime(file: File): boolean {
  return file.type.startsWith('image/');
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader returned a non-string result.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed.'));
    reader.readAsDataURL(file);
  });
}

function decodeImageDims(dataUrl: string): Promise<ImageDims> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const naturalWidth = img.naturalWidth || img.width;
      const naturalHeight = img.naturalHeight || img.height;
      if (!naturalWidth || !naturalHeight) {
        reject(new Error('Image has zero dimensions.'));
        return;
      }
      resolve({ width: naturalWidth, height: naturalHeight, dataUrl });
    };
    img.onerror = () => reject(new Error("We couldn't decode that photo."));
    img.src = dataUrl;
  });
}

interface FitBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function fitContain(
  imageWidth: number,
  imageHeight: number,
  pageWidth: number,
  pageHeight: number,
  margin: number,
): FitBox {
  const maxContentWidth = pageWidth - margin * 2;
  const maxContentHeight = pageHeight - margin * 2;
  const scale = Math.min(maxContentWidth / imageWidth, maxContentHeight / imageHeight);
  const scaledWidth = imageWidth * scale;
  const scaledHeight = imageHeight * scale;
  return {
    x: (pageWidth - scaledWidth) / 2,
    y: (pageHeight - scaledHeight) / 2,
    width: scaledWidth,
    height: scaledHeight,
  };
}

function jsPdfFormat(dataUrl: string): 'JPEG' | 'PNG' {
  // jsPDF's addImage requires the format hint. Cheap mime sniff from the
  // data URL prefix; default to JPEG (mobile cameras emit JPEG ~99% of
  // the time, and any unknown format goes through the catch in the
  // caller).
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  return 'JPEG';
}

function swapExtension(name: string, ext: string): string {
  // Replace trailing image extension; if none, append. We accept HEIC,
  // HEIF, JPG, JPEG, PNG, WEBP — anything else falls into the append
  // branch.
  const stripped = name.replace(/\.(jpg|jpeg|png|webp|heic|heif)$/i, '');
  return `${stripped}.${ext}`;
}

/**
 * Convert a JPEG/PNG `File` (camera capture or gallery pick) into a
 * single-page A4 portrait PDF `File`. The returned File has `type:
 * "application/pdf"` and a `<base>.pdf` name so it slots straight into
 * the existing send-flow that branches on PDF MIME.
 *
 * Throws when the input MIME isn't an image, the bytes can't be
 * decoded, or jsPDF's addImage rejects (corrupt image, unsupported
 * sub-format like HEIC on most browsers, etc.). Callers should catch
 * and surface a friendly fallback message.
 */
export async function imageFileToPdf(file: File): Promise<File> {
  if (!isImageMime(file)) {
    throw new Error('imageFileToPdf expects an image/* file.');
  }
  const dataUrl = await readFileAsDataUrl(file);
  const dims = await decodeImageDims(dataUrl);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const box = fitContain(dims.width, dims.height, A4_WIDTH_MM, A4_HEIGHT_MM, PAGE_MARGIN_MM);
  pdf.addImage(dataUrl, jsPdfFormat(dataUrl), box.x, box.y, box.width, box.height);
  // `arraybuffer` output skips the Blob wrapper — jsdom's polyfilled
  // Blob doesn't implement `.arrayBuffer()`, so the unit test would
  // otherwise need a Blob shim. Real browsers return the same bytes
  // either way.
  const ab = pdf.output('arraybuffer') as ArrayBuffer;
  const outName = swapExtension(file.name, 'pdf');
  return new File([new Uint8Array(ab)], outName, { type: 'application/pdf' });
}
