import type { TemplateFieldType } from './templates';

/**
 * Editor canvas width. Template layouts saved before `coordVersion` 2
 * store `x` in this grid. `y` uses the same width times the displayed
 * page aspect (`560 * pageHeight / pageWidth`).
 */
export const TEMPLATE_GRID_WIDTH = 560;

/**
 * Canvas height when the authoring PDF's page size is unknown.
 * `560 * 740 / 560`.
 */
export const TEMPLATE_GRID_HEIGHT_FALLBACK = 740;

/** Stored on a template field when `x`/`y`/`width`/`height` are 0–1. */
export const TEMPLATE_COORD_VERSION = 2 as const;

/**
 * Pixel box the send path stores when a field has no explicit size.
 * Checkbox is 24, matching `DocumentRoute` / the signing surface.
 * The editor's drag default for a checkbox is 28; that size is only
 * used when the author has resized the box.
 */
export const TEMPLATE_FIELD_DEFAULT_PX: Record<
  TemplateFieldType,
  { readonly w: number; readonly h: number }
> = {
  signature: { w: 200, h: 54 },
  initial: { w: 80, h: 54 },
  date: { w: 140, h: 36 },
  text: { w: 240, h: 36 },
  email: { w: 240, h: 36 },
  checkbox: { w: 24, h: 24 },
};

/** Smallest positive `numeric(7,4)` that still satisfies `width > 0`. */
const MIN_UNIT = 0.0001;

export interface TemplatePageAspect {
  readonly width: number;
  readonly height: number;
}

export interface NormalizedTemplateBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function templateGridHeight(pageWidth: number, pageHeight: number): number {
  if (!(pageWidth > 0) || !(pageHeight > 0)) return TEMPLATE_GRID_HEIGHT_FALLBACK;
  return TEMPLATE_GRID_WIDTH * (pageHeight / pageWidth);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function clampPositiveUnit(value: number): number {
  if (!Number.isFinite(value) || value <= MIN_UNIT) return MIN_UNIT;
  if (value >= 1) return 1;
  return value;
}

export interface TemplateBoxInput {
  readonly type: TemplateFieldType;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
  readonly coordVersion?: typeof TEMPLATE_COORD_VERSION;
}

/**
 * Convert a stored template field into 0–1 fractions of the displayed page.
 *
 * `coordVersion` 2 is already that fraction. A missing width or height
 * is filled from {@link TEMPLATE_FIELD_DEFAULT_PX}.
 *
 * Older rows are 560-grid editor pixels:
 * `x / 560` and `y / (560 * pageHeight / pageWidth)`.
 */
export function normalizeTemplateFieldBox(
  field: TemplateBoxInput,
  page: TemplatePageAspect,
): NormalizedTemplateBox {
  const gridH = templateGridHeight(page.width, page.height);
  const defaults = TEMPLATE_FIELD_DEFAULT_PX[field.type];
  if (field.coordVersion === TEMPLATE_COORD_VERSION) {
    return {
      x: clamp01(field.x),
      y: clamp01(field.y),
      width: clampPositiveUnit(field.width ?? defaults.w / TEMPLATE_GRID_WIDTH),
      height: clampPositiveUnit(field.height ?? defaults.h / gridH),
    };
  }
  const widthPx = field.width ?? defaults.w;
  const heightPx = field.height ?? defaults.h;
  return {
    x: clamp01(field.x / TEMPLATE_GRID_WIDTH),
    y: clamp01(field.y / gridH),
    width: clampPositiveUnit(widthPx / TEMPLATE_GRID_WIDTH),
    height: clampPositiveUnit(heightPx / gridH),
  };
}

/**
 * Normalize editor pixels into a `coordVersion` 2 box. `page` is the
 * displayed page size; only the aspect ratio is used. When it is
 * omitted, the grid height is {@link TEMPLATE_GRID_HEIGHT_FALLBACK}.
 */
export function toTemplateCoordV2(
  field: {
    readonly type: TemplateFieldType;
    readonly x: number;
    readonly y: number;
    readonly width?: number;
    readonly height?: number;
  },
  page?: TemplatePageAspect,
): NormalizedTemplateBox & { readonly coordVersion: typeof TEMPLATE_COORD_VERSION } {
  const aspect =
    page && page.width > 0 && page.height > 0
      ? page
      : { width: TEMPLATE_GRID_WIDTH, height: TEMPLATE_GRID_HEIGHT_FALLBACK };
  return {
    coordVersion: TEMPLATE_COORD_VERSION,
    ...normalizeTemplateFieldBox(field, aspect),
  };
}

/**
 * Turn a saved template field back into editor pixels. Legacy rows
 * (no `coordVersion`) are already pixels. Version 2 is a 0–1 fraction
 * of the 560-wide grid and `gridHeight`.
 */
export function templateFieldToEditorPixels(
  field: {
    readonly x: number;
    readonly y: number;
    readonly width?: number;
    readonly height?: number;
    readonly coordVersion?: typeof TEMPLATE_COORD_VERSION;
  },
  gridHeight: number = TEMPLATE_GRID_HEIGHT_FALLBACK,
): { readonly x: number; readonly y: number; readonly width?: number; readonly height?: number } {
  if (field.coordVersion !== TEMPLATE_COORD_VERSION) {
    return { x: field.x, y: field.y };
  }
  const heightBasis = gridHeight > 0 ? gridHeight : TEMPLATE_GRID_HEIGHT_FALLBACK;
  const placed: { x: number; y: number; width?: number; height?: number } = {
    x: Math.round(clamp01(field.x) * TEMPLATE_GRID_WIDTH),
    y: Math.round(clamp01(field.y) * heightBasis),
  };
  if (field.width !== undefined) {
    placed.width = Math.max(1, Math.round(clampPositiveUnit(field.width) * TEMPLATE_GRID_WIDTH));
  }
  if (field.height !== undefined) {
    placed.height = Math.max(1, Math.round(clampPositiveUnit(field.height) * heightBasis));
  }
  return placed;
}
