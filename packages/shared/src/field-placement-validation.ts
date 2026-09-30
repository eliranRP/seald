/**
 * Shared placement rules for the MCP field engine and, later, the SPA
 * before it calls replaceFields. Locator resolution stays in the API.
 * Messages and next_steps are fixed strings: document text is never
 * interpolated here. Put it on structured fields such as nearest_text.
 */

import { FIELD_KINDS, signerIdsWithRequiredSignature } from './signer';

/** Stored kinds, plus the `name` alias (`text` + `link_id: 'name'`). */
export const PLACEMENT_KINDS = [...FIELD_KINDS, 'name'] as const;

export type PlacementKind = (typeof PLACEMENT_KINDS)[number];

export const PLACEMENT_ISSUE_SLUGS = [
  'field_page_out_of_range',
  'field_out_of_bounds',
  'field_too_small',
  'fields_overlap',
  'field_covers_text',
  'signer_without_signature_field',
  'signer_not_in_envelope',
  'invalid_field_locator',
  'anchor_not_found',
  'anchor_occurrence_out_of_range',
  'form_field_not_found',
  'form_field_ambiguous',
] as const;

export type PlacementIssueSlug = (typeof PLACEMENT_ISSUE_SLUGS)[number];

export type PlacementStage = 'place' | 'preview' | 'send';

export const PLACEMENT_TOOLS = [
  'envelopes_inspect_document',
  'envelopes_place_fields',
  'envelopes_update_fields',
] as const;

export type PlacementTool = (typeof PLACEMENT_TOOLS)[number];

export interface PlacementNextStep {
  readonly tool: PlacementTool;
  readonly hint: string;
}

export interface PlacementBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlacementOverflowPt {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type PlacementTextSide = 'left' | 'right' | 'above' | 'below' | 'over';

export interface PlacementNearestText {
  readonly text: string;
  readonly distance_pt: number;
  readonly side: PlacementTextSide;
}

export interface PlacementIssueDetails {
  readonly field_id?: string;
  readonly client_ref?: string;
  readonly signer_id?: string;
  readonly page?: number;
  readonly overflow_pt?: PlacementOverflowPt;
  readonly match_count?: number;
  readonly other_field_id?: string;
  readonly nearest_text?: PlacementNearestText;
}

export interface PlacementIssue extends PlacementIssueDetails {
  readonly slug: PlacementIssueSlug;
  readonly message: string;
  readonly retryable: false;
  readonly next_steps: readonly PlacementNextStep[];
}

export interface ResolvedPlacementField {
  readonly id: string;
  readonly client_ref?: string;
  readonly signer_id: string;
  readonly kind: PlacementKind;
  readonly required: boolean;
  readonly page: number;
  readonly box: PlacementBox;
}

export interface PlacementTextLine {
  readonly page: number;
  readonly text: string;
  readonly box: PlacementBox;
}

export interface PlacementPageView {
  readonly page: number;
  readonly view_width: number;
  readonly view_height: number;
}

export interface PlacementValidationInput {
  readonly fields: readonly ResolvedPlacementField[];
  readonly signers: readonly { readonly id: string }[];
  readonly pages: readonly PlacementPageView[];
  readonly page_count: number;
  readonly text_lines: readonly PlacementTextLine[];
  readonly stage: PlacementStage;
}

export interface PlacementValidation {
  readonly errors: readonly PlacementIssue[];
  readonly warnings: readonly PlacementIssue[];
  readonly envelope_errors: readonly PlacementIssue[];
  readonly ready: boolean;
}

export const DEFAULT_FIELD_SIZE_PT: Record<
  PlacementKind,
  { readonly width: number; readonly height: number }
> = {
  signature: { width: 180, height: 50 },
  initials: { width: 72, height: 40 },
  date: { width: 110, height: 24 },
  text: { width: 180, height: 24 },
  email: { width: 200, height: 24 },
  name: { width: 180, height: 24 },
  checkbox: { width: 16, height: 16 },
};

export const MIN_FIELD_SIZE_PT: Record<
  PlacementKind,
  { readonly width: number; readonly height: number }
> = {
  signature: { width: 60, height: 20 },
  initials: { width: 24, height: 16 },
  date: { width: 40, height: 14 },
  text: { width: 40, height: 14 },
  email: { width: 60, height: 14 },
  name: { width: 40, height: 14 },
  checkbox: { width: 8, height: 8 },
};

const BOUNDS_EPSILON_PT = 0.01;
const OVERLAP_AREA_PT2 = 0.5;
const COVER_FRACTION = 0.25;

const ENVELOPE_SLUGS = new Set<PlacementIssueSlug>([
  'signer_without_signature_field',
  'signer_not_in_envelope',
]);

export function isPlacementKind(value: string): value is PlacementKind {
  return (PLACEMENT_KINDS as readonly string[]).includes(value);
}

function formatPt(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function messageFor(slug: PlacementIssueSlug, details: PlacementIssueDetails | undefined): string {
  switch (slug) {
    case 'field_page_out_of_range':
      return 'Field page is outside 1..page_count.';
    case 'field_out_of_bounds': {
      const overflow = details?.overflow_pt ?? { left: 0, top: 0, right: 0, bottom: 0 };
      return (
        `Field box is outside the displayed page by ${formatPt(overflow.left)} pt left, ` +
        `${formatPt(overflow.top)} pt top, ${formatPt(overflow.right)} pt right, ` +
        `${formatPt(overflow.bottom)} pt bottom.`
      );
    }
    case 'field_too_small':
      return 'Field is smaller than the minimum size for its kind.';
    case 'fields_overlap':
      return `Fields ${details?.field_id ?? ''} and ${details?.other_field_id ?? ''} overlap.`;
    case 'field_covers_text':
      return 'Field covers more than 25% of a text line.';
    case 'signer_without_signature_field':
      return 'Signer has no required signature or initials field.';
    case 'signer_not_in_envelope':
      return 'Signer is not on this envelope.';
    case 'invalid_field_locator':
      return 'Field must name a known kind and exactly one of box, anchor, or form_field.';
    case 'anchor_not_found':
      return `Anchor text was not found (match_count ${details?.match_count ?? 0}).`;
    case 'anchor_occurrence_out_of_range':
      return `Anchor occurrence is outside the matches (match_count ${details?.match_count ?? 0}).`;
    case 'form_field_not_found':
      return 'Form field was not found.';
    case 'form_field_ambiguous':
      return `Form field matches more than one widget (match_count ${details?.match_count ?? 0}).`;
    default: {
      const neverSlug: never = slug;
      return neverSlug;
    }
  }
}

function nextStepsFor(slug: PlacementIssueSlug): readonly PlacementNextStep[] {
  switch (slug) {
    case 'anchor_not_found':
    case 'anchor_occurrence_out_of_range':
    case 'form_field_not_found':
    case 'form_field_ambiguous':
    case 'field_page_out_of_range':
      return [
        {
          tool: 'envelopes_inspect_document',
          hint: 'Inspect the document, then place the field again.',
        },
      ];
    case 'field_out_of_bounds':
    case 'field_too_small':
    case 'fields_overlap':
    case 'field_covers_text':
      return [
        {
          tool: 'envelopes_update_fields',
          hint: 'Move or resize the field, then validate again.',
        },
      ];
    case 'signer_without_signature_field':
    case 'signer_not_in_envelope':
    case 'invalid_field_locator':
      return [
        {
          tool: 'envelopes_place_fields',
          hint: 'Place the field with a signer on this envelope and one locator.',
        },
      ];
    default: {
      const neverSlug: never = slug;
      return neverSlug;
    }
  }
}

function withDetails(
  slug: PlacementIssueSlug,
  details: PlacementIssueDetails | undefined,
): PlacementIssue {
  return {
    slug,
    message: messageFor(slug, details),
    retryable: false,
    next_steps: nextStepsFor(slug),
    ...(details?.field_id !== undefined ? { field_id: details.field_id } : {}),
    ...(details?.client_ref !== undefined ? { client_ref: details.client_ref } : {}),
    ...(details?.signer_id !== undefined ? { signer_id: details.signer_id } : {}),
    ...(details?.page !== undefined ? { page: details.page } : {}),
    ...(details?.overflow_pt !== undefined ? { overflow_pt: details.overflow_pt } : {}),
    ...(details?.match_count !== undefined ? { match_count: details.match_count } : {}),
    ...(details?.other_field_id !== undefined ? { other_field_id: details.other_field_id } : {}),
    ...(details?.nearest_text !== undefined ? { nearest_text: details.nearest_text } : {}),
  };
}

export function placementIssue(
  slug: PlacementIssueSlug,
  details?: PlacementIssueDetails,
): PlacementIssue {
  return withDetails(slug, details);
}

function pageInRange(page: number, pageCount: number): boolean {
  return Number.isInteger(page) && page >= 1 && page <= pageCount;
}

function findPage(
  pages: readonly PlacementPageView[],
  page: number,
): PlacementPageView | undefined {
  return pages.find((candidate) => candidate.page === page);
}

function overflowOf(box: PlacementBox, view: PlacementPageView): PlacementOverflowPt | null {
  const left = Math.max(0, -box.x);
  const top = Math.max(0, -box.y);
  const right = Math.max(0, box.x + box.width - view.view_width);
  const bottom = Math.max(0, box.y + box.height - view.view_height);
  const outside =
    box.x < -BOUNDS_EPSILON_PT ||
    box.y < -BOUNDS_EPSILON_PT ||
    box.x + box.width > view.view_width + BOUNDS_EPSILON_PT ||
    box.y + box.height > view.view_height + BOUNDS_EPSILON_PT;
  if (!outside) return null;
  return { left, top, right, bottom };
}

function intersectionArea(a: PlacementBox, b: PlacementBox): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

function fieldDetails(field: ResolvedPlacementField): PlacementIssueDetails {
  return {
    field_id: field.id,
    signer_id: field.signer_id,
    page: field.page,
    ...(field.client_ref !== undefined ? { client_ref: field.client_ref } : {}),
  };
}

function separation(
  a: PlacementBox,
  b: PlacementBox,
): { readonly gapX: number; readonly gapY: number } {
  let gapX = 0;
  if (a.x + a.width < b.x) gapX = b.x - (a.x + a.width);
  else if (b.x + b.width < a.x) gapX = a.x - (b.x + b.width);
  let gapY = 0;
  if (a.y + a.height < b.y) gapY = b.y - (a.y + a.height);
  else if (b.y + b.height < a.y) gapY = a.y - (b.y + b.height);
  return { gapX, gapY };
}

function textSide(
  field: PlacementBox,
  text: PlacementBox,
  gapX: number,
  gapY: number,
): PlacementTextSide {
  if (gapX === 0 && gapY === 0) return 'over';
  const fieldCx = field.x + field.width / 2;
  const fieldCy = field.y + field.height / 2;
  const textCx = text.x + text.width / 2;
  const textCy = text.y + text.height / 2;
  if (gapX > gapY) return textCx < fieldCx ? 'left' : 'right';
  return textCy < fieldCy ? 'above' : 'below';
}

export function nearestTextForBox(
  box: PlacementBox,
  page: number,
  lines: readonly PlacementTextLine[],
): PlacementNearestText | null {
  let best: PlacementNearestText | null = null;
  for (const line of lines) {
    if (line.page !== page || line.text.length === 0) continue;
    const area = line.box.width * line.box.height;
    if (!(area > 0)) continue;
    const { gapX, gapY } = separation(box, line.box);
    const distance = Math.hypot(gapX, gapY);
    if (best !== null && distance >= best.distance_pt) continue;
    best = {
      text: line.text,
      distance_pt: distance,
      side: textSide(box, line.box, gapX, gapY),
    };
  }
  return best;
}

function coveringLine(
  field: ResolvedPlacementField,
  lines: readonly PlacementTextLine[],
): PlacementTextLine | null {
  let best: PlacementTextLine | null = null;
  let bestFraction = COVER_FRACTION;
  for (const line of lines) {
    if (line.page !== field.page) continue;
    const area = line.box.width * line.box.height;
    if (!(area > 0)) continue;
    const fraction = intersectionArea(field.box, line.box) / area;
    if (fraction > bestFraction) {
      best = line;
      bestFraction = fraction;
    }
  }
  return best;
}

export function validateFieldPlacement(input: PlacementValidationInput): PlacementValidation {
  const errors: PlacementIssue[] = [];
  const warnings: PlacementIssue[] = [];
  const signerIds = new Set(input.signers.map((signer) => signer.id));

  for (const field of input.fields) {
    if (!signerIds.has(field.signer_id)) {
      errors.push(
        placementIssue('signer_not_in_envelope', {
          ...fieldDetails(field),
        }),
      );
    }
    if (!pageInRange(field.page, input.page_count)) {
      errors.push(placementIssue('field_page_out_of_range', fieldDetails(field)));
      continue;
    }
    const view = findPage(input.pages, field.page);
    if (!view) {
      errors.push(placementIssue('field_page_out_of_range', fieldDetails(field)));
      continue;
    }
    const overflow = overflowOf(field.box, view);
    if (overflow) {
      errors.push(
        placementIssue('field_out_of_bounds', { ...fieldDetails(field), overflow_pt: overflow }),
      );
    }
    const minimum = MIN_FIELD_SIZE_PT[field.kind];
    if (
      field.box.width < minimum.width - BOUNDS_EPSILON_PT ||
      field.box.height < minimum.height - BOUNDS_EPSILON_PT
    ) {
      errors.push(placementIssue('field_too_small', fieldDetails(field)));
    }
    const covered = coveringLine(field, input.text_lines);
    if (covered) {
      const nearest = nearestTextForBox(field.box, field.page, [covered]);
      warnings.push(
        placementIssue('field_covers_text', {
          ...fieldDetails(field),
          ...(nearest ? { nearest_text: nearest } : {}),
        }),
      );
    }
  }

  for (let i = 0; i < input.fields.length; i += 1) {
    const left = input.fields[i];
    if (!left || !pageInRange(left.page, input.page_count)) continue;
    for (let j = i + 1; j < input.fields.length; j += 1) {
      const right = input.fields[j];
      if (!right || right.page !== left.page) continue;
      if (intersectionArea(left.box, right.box) <= OVERLAP_AREA_PT2) continue;
      errors.push(
        placementIssue('fields_overlap', {
          ...fieldDetails(left),
          other_field_id: right.id,
        }),
      );
    }
  }

  const signed = signerIdsWithRequiredSignature(input.fields);
  for (const signer of input.signers) {
    if (signed.has(signer.id)) continue;
    const issue = placementIssue('signer_without_signature_field', { signer_id: signer.id });
    if (input.stage === 'place') warnings.push(issue);
    else errors.push(issue);
  }

  const envelope_errors = [...errors, ...warnings].filter((issue) =>
    ENVELOPE_SLUGS.has(issue.slug),
  );
  return { errors, warnings, envelope_errors, ready: errors.length === 0 };
}
