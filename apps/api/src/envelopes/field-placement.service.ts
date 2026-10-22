import { BadRequestException } from '@nestjs/common';
import { isNewFieldKind, parseFieldMeta, type AnyFieldKind as FieldKind } from 'shared';

/**
 * One field as `PUT /envelopes/:id/fields` accepts it, before defaults.
 * Coordinates are normalized 0–1, top-left origin, page ≥ 1.
 * Anchor text and AcroForm reuse extend this module; they do not live
 * in a controller.
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
  /** WP-03. Only present while `multiDocumentEnvelopes` is on. */
  readonly document_id?: string;
  /** WP-07. Only present while `fieldMetaV2` is on. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** The row `EnvelopesService.replaceFields` stores. */
export interface NormalizedFieldPlacement {
  readonly signer_id: string;
  readonly kind: FieldKind;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly required: boolean;
  readonly link_id: string | null;
  /** WP-03. Omitted means document 1. */
  readonly document_id?: string;
  /** WP-07. Omitted unless the request carried meta. */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/**
 * Apply the place-fields defaults: omitted width, height, and link id
 * become null; omitted required becomes true.
 */
export function normalizeFieldPlacements(
  fields: readonly FieldPlacementInput[],
): NormalizedFieldPlacement[] {
  return fields.map((f) => ({
    signer_id: f.signer_id,
    kind: f.kind,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width ?? null,
    height: f.height ?? null,
    // WP-07: an explicit `required` wins; otherwise `meta.required`.
    required: f.required ?? (typeof f.meta?.['required'] === 'boolean' ? f.meta['required'] : true),
    link_id: f.link_id ?? null,
    ...(f.document_id !== undefined ? { document_id: f.document_id } : {}),
    ...(f.meta !== undefined ? { meta: f.meta } : {}),
  }));
}

/**
 * WP-07. Validate every placement's `meta` against its kind with the shared
 * Zod union and return the placements with the parsed (stripped, typed)
 * meta. With `fieldMetaV2` on, every field is stored with a meta object
 * (`{}` when none was sent); radio and dropdown therefore must carry
 * `options`. Throws one 400 listing every problem as `fields.<i>.meta...`.
 */
export function validatePlacementMeta<
  T extends { readonly kind: FieldKind; readonly meta?: Readonly<Record<string, unknown>> },
>(fields: readonly T[]): Array<T & { readonly meta: Readonly<Record<string, unknown>> }> {
  const problems: string[] = [];
  const out = fields.map((f, i) => {
    const parsed = parseFieldMeta(f.kind, f.meta ?? {});
    if (!parsed.ok) {
      for (const issue of parsed.issues) {
        problems.push(`fields.${i}.${issue.path}: ${issue.message}`);
      }
      return { ...f, meta: {} };
    }
    return { ...f, meta: parsed.meta };
  });
  if (problems.length > 0) throw new BadRequestException(problems);
  return out;
}

/**
 * WP-07 flag-off guard for callers that skip the DTO (MCP, scripts): new
 * kinds and meta are refused with the plain `validation_error` slug.
 */
export function assertNoMetaV2(
  fields: ReadonlyArray<{ readonly kind: FieldKind; readonly meta?: unknown }>,
): void {
  if (fields.some((f) => f.meta !== undefined || isNewFieldKind(f.kind))) {
    throw new BadRequestException('validation_error');
  }
}
