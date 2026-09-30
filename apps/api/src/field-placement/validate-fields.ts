import type { FieldKind } from 'shared';
import type {
  DisplayedBox,
  FieldIssue,
  FieldReport,
  PageSize,
  PlacedField,
  TextRun,
  ValidationReport,
} from './field-placement.types';

/** Minimum displayed size, in PDF points, before a field is `too_small`. */
export const MIN_FIELD_SIZE_PT: Record<FieldKind, { readonly w: number; readonly h: number }> = {
  signature: { w: 36, h: 16 },
  initials: { w: 16, h: 12 },
  date: { w: 36, h: 12 },
  text: { w: 24, h: 12 },
  checkbox: { w: 10, h: 10 },
  email: { w: 48, h: 12 },
};

const BOUNDS_SLOP_PT = 0.5;

export interface ValidateInput {
  readonly pages: readonly PageSize[];
  readonly textRuns: readonly TextRun[];
  readonly fields: readonly PlacedField[];
  /** Signers that must each own a signature. Defaults to signers present on `fields`. */
  readonly signerIds?: readonly string[];
  /**
   * Boxes the caller asked for, before 4-decimal clamping. Keyed by field id.
   * When omitted, the stored box is the request.
   */
  readonly requestedBoxes?: ReadonlyMap<string, DisplayedBox>;
}

function error(
  code: FieldIssue['code'],
  message: string,
  field: {
    id: string | null;
    signerId: string | null;
    page: number | null;
    box: DisplayedBox | null;
  },
): FieldIssue {
  return {
    code,
    severity: 'error',
    fieldId: field.id,
    signerId: field.signerId,
    message,
    page: field.page,
    box: field.box,
  };
}

function outside(box: DisplayedBox, page: PageSize): boolean {
  return (
    box.x < -BOUNDS_SLOP_PT ||
    box.y < -BOUNDS_SLOP_PT ||
    box.x + box.w > page.width + BOUNDS_SLOP_PT ||
    box.y + box.h > page.height + BOUNDS_SLOP_PT
  );
}

function intersection(a: DisplayedBox, b: DisplayedBox): { w: number; h: number } | null {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w > BOUNDS_SLOP_PT && h > BOUNDS_SLOP_PT) return { w, h };
  return null;
}

function gap(a: DisplayedBox, b: DisplayedBox): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

export function validatePlacedFields(input: ValidateInput): ValidationReport {
  const errors: FieldIssue[] = [];
  const warnings: FieldIssue[] = [];
  const reports: FieldReport[] = [];
  const pages = new Map(input.pages.map((page) => [page.page, page]));

  for (const field of input.fields) {
    const page = pages.get(field.page);
    if (!page) {
      errors.push(
        error('page_not_found', `Page ${field.page} is not in this document.`, {
          id: field.id,
          signerId: field.signer_id,
          page: field.page,
          box: field.box,
        }),
      );
      continue;
    }
    const requested = input.requestedBoxes?.get(field.id) ?? field.box;
    if (outside(requested, page) || outside(field.box, page)) {
      errors.push(
        error('out_of_bounds', `Field ${field.id} extends outside page ${field.page}.`, {
          id: field.id,
          signerId: field.signer_id,
          page: field.page,
          box: field.box,
        }),
      );
    }
    const minimum = MIN_FIELD_SIZE_PT[field.kind];
    if (field.box.w + BOUNDS_SLOP_PT < minimum.w || field.box.h + BOUNDS_SLOP_PT < minimum.h) {
      errors.push(
        error(
          'too_small',
          `Field ${field.id} (${field.kind}) is smaller than ${minimum.w}×${minimum.h} pt.`,
          { id: field.id, signerId: field.signer_id, page: field.page, box: field.box },
        ),
      );
    }

    const onPage = input.textRuns.filter((run) => run.page === field.page);
    let nearest: FieldReport['nearestText'] = null;
    for (const run of onPage) {
      const distance = gap(field.box, run);
      if (!nearest || distance < nearest.distance) {
        nearest = { text: run.text, distance, box: run };
      }
      if (intersection(field.box, run)) {
        warnings.push({
          code: 'covers_text',
          severity: 'warning',
          fieldId: field.id,
          signerId: field.signer_id,
          message: `Field ${field.id} covers the text "${run.text}".`,
          page: field.page,
          box: field.box,
        });
      }
    }
    reports.push({
      id: field.id,
      kind: field.kind,
      signerId: field.signer_id,
      page: field.page,
      box: field.box,
      nearestText: nearest,
    });
  }

  for (let i = 0; i < input.fields.length; i += 1) {
    const left = input.fields[i];
    if (!left) continue;
    for (let j = i + 1; j < input.fields.length; j += 1) {
      const right = input.fields[j];
      if (!right || left.page !== right.page) continue;
      if (!intersection(left.box, right.box)) continue;
      errors.push(
        error('overlap', `Fields ${left.id} and ${right.id} overlap.`, {
          id: left.id,
          signerId: left.signer_id,
          page: left.page,
          box: left.box,
        }),
      );
    }
  }

  const requiredSigners =
    input.signerIds ?? Array.from(new Set(input.fields.map((field) => field.signer_id)));
  for (const signerId of requiredSigners) {
    const signed = input.fields.some(
      (field) => field.signer_id === signerId && field.kind === 'signature',
    );
    if (!signed) {
      errors.push(
        error('missing_signature', `Signer ${signerId} has no signature field.`, {
          id: null,
          signerId,
          page: null,
          box: null,
        }),
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings, fields: reports };
}
