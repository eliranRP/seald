import { createCanvas, loadImage } from 'canvas';
import type { PlacedField, PreviewPage } from './field-placement.types';

/** One displayed point becomes this many pixels. */
export const PREVIEW_SCALE = 2;

function labelFor(field: PlacedField): string {
  const kind = field.kind === 'text' && field.link_id === 'name' ? 'name' : field.kind;
  return `${kind} · ${field.signer_name} · ${field.id}`;
}

export async function renderPagePreview(
  background: Buffer,
  pageNumber: number,
  fields: readonly PlacedField[],
): Promise<PreviewPage> {
  const image = await loadImage(background);
  const width = image.width;
  const height = image.height;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  const scale = PREVIEW_SCALE;
  for (const field of fields) {
    if (field.page !== pageNumber) continue;
    const x = field.box.x * scale;
    const y = field.box.y * scale;
    const w = field.box.w * scale;
    const h = field.box.h * scale;
    ctx.save();
    ctx.fillStyle = hexToRgba(field.signer_color, 0.18);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = field.signer_color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    const text = labelFor(field);
    const fontSize = Math.max(12, Math.round(8 * scale));
    ctx.font = `600 ${fontSize}px sans-serif`;
    const measured = ctx.measureText(text);
    const pad = 4;
    const labelW = measured.width + pad * 2;
    const labelH = fontSize + pad * 2;
    const labelY = y >= labelH + 2 ? y - labelH - 2 : y + 2;
    ctx.fillStyle = field.signer_color;
    ctx.fillRect(x, labelY, labelW, labelH);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + pad, labelY + fontSize + pad / 2);
    ctx.restore();
  }

  return {
    page: pageNumber,
    png: canvas.toBuffer('image/png'),
    width,
    height,
    scale,
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  const raw = match?.[1];
  if (!raw) return `rgba(37, 99, 235, ${alpha})`;
  const value = Number.parseInt(raw, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
