import type { FieldKind } from 'shared';

/**
 * One field as `PUT /envelopes/:id/fields` accepts it, before defaults.
 * This is also the repository's `CreateFieldInput`. Coordinates are
 * normalized 0–1, top-left origin, page ≥ 1. Anchor text and AcroForm
 * reuse extend this module; they do not live in a controller.
 */
export interface FieldPlacementInput {
  readonly signer_id: string;
  readonly kind: FieldKind;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly required?: boolean;
  readonly link_id?: string | null;
}

/**
 * Apply the place-fields defaults: omitted width, height, and link id
 * become null; omitted required becomes true. `EnvelopesService.replaceFields`
 * calls this so a caller does not depend on the database default.
 */
export function normalizeFieldPlacements(
  fields: readonly FieldPlacementInput[],
): FieldPlacementInput[] {
  return fields.map((f) => ({
    signer_id: f.signer_id,
    kind: f.kind,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width ?? null,
    height: f.height ?? null,
    required: f.required ?? true,
    link_id: f.link_id ?? null,
  }));
}
