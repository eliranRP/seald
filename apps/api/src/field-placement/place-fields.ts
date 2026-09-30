import {
  DEFAULT_FIELD_SIZE_PT,
  isPlacementKind,
  placementIssue,
  type PlacementBox,
  type PlacementIssue,
  type PlacementKind,
} from 'shared';
import { normalizeRect } from '../envelopes/coord';
import type { LoadedDocument, LoadedFormField } from './pdf-document';
import type { NormalizedPlacement, PlacementFieldInput } from './field-placement.types';
import { anchorFieldBox, findAnchorMatches } from './text-index';

export interface ResolvedPlacement {
  readonly provisionalId: string;
  readonly clientRef: string | null;
  readonly label: string | null;
  readonly signerId: string;
  readonly kind: PlacementKind;
  readonly required: boolean;
  readonly page: number;
  readonly box: PlacementBox;
  readonly normalized: NormalizedPlacement;
  readonly source: string;
}

export interface ResolveResult {
  readonly resolved: readonly ResolvedPlacement[];
  readonly issues: readonly PlacementIssue[];
}

function locatorCount(field: PlacementFieldInput): number {
  let count = 0;
  if (field.box !== undefined) count += 1;
  if (field.anchor !== undefined) count += 1;
  if (field.form_field !== undefined) count += 1;
  return count;
}

function fieldSize(
  kind: PlacementKind,
  width: number | undefined,
  height: number | undefined,
): { readonly width: number; readonly height: number } {
  const defaults = DEFAULT_FIELD_SIZE_PT[kind];
  return {
    width: width ?? defaults.width,
    height: height ?? defaults.height,
  };
}

export function normalizePlacement(
  page: number,
  box: PlacementBox,
  doc: LoadedDocument,
): NormalizedPlacement {
  const geometry = doc.pages.find((candidate) => candidate.info.page === page);
  if (!geometry) return { page, x: 0, y: 0, width: 0, height: 0 };
  const normalized = normalizeRect(
    { x: box.x, y: box.y, width: box.width, height: box.height },
    { width: geometry.info.width, height: geometry.info.height },
  );
  return {
    page,
    x: normalized.x,
    y: normalized.y,
    width: normalized.width ?? 0,
    height: normalized.height ?? 0,
  };
}

function resolvedFrom(
  field: PlacementFieldInput,
  index: number,
  kind: PlacementKind,
  page: number,
  box: PlacementBox,
  source: string,
  doc: LoadedDocument,
): ResolvedPlacement {
  const clientRef = field.client_ref ?? null;
  return {
    provisionalId: clientRef !== null && clientRef.length > 0 ? clientRef : `field:${index}`,
    clientRef,
    label: field.label ?? null,
    signerId: field.signer_id,
    kind,
    required: field.required ?? true,
    page,
    box,
    normalized: normalizePlacement(page, box, doc),
    source,
  };
}

function invalid(field: PlacementFieldInput, index: number): PlacementIssue {
  const clientRef = field.client_ref;
  return placementIssue('invalid_field_locator', {
    field_id: clientRef !== undefined && clientRef.length > 0 ? clientRef : `field:${index}`,
    signer_id: field.signer_id,
    ...(clientRef !== undefined ? { client_ref: clientRef } : {}),
  });
}

function resolveBox(
  field: PlacementFieldInput,
  index: number,
  kind: PlacementKind,
  doc: LoadedDocument,
): ResolvedPlacement {
  const boxInput = field.box;
  if (!boxInput)
    return resolvedFrom(field, index, kind, 1, { x: 0, y: 0, width: 0, height: 0 }, 'box', doc);
  const size = fieldSize(kind, boxInput.width, boxInput.height);
  const box: PlacementBox = { x: boxInput.x, y: boxInput.y, ...size };
  return resolvedFrom(field, index, kind, boxInput.page, box, 'box', doc);
}

function resolveAnchor(
  field: PlacementFieldInput,
  index: number,
  kind: PlacementKind,
  doc: LoadedDocument,
): { readonly placement: ResolvedPlacement | null; readonly issue: PlacementIssue | null } {
  const anchor = field.anchor;
  if (!anchor) return { placement: null, issue: invalid(field, index) };
  const matches = findAnchorMatches(doc.lines, anchor);
  const occurrence = anchor.occurrence ?? 1;
  const details = {
    field_id:
      field.client_ref !== undefined && field.client_ref.length > 0
        ? field.client_ref
        : `field:${index}`,
    signer_id: field.signer_id,
    match_count: matches.length,
    ...(field.client_ref !== undefined ? { client_ref: field.client_ref } : {}),
  };
  if (matches.length === 0) {
    return { placement: null, issue: placementIssue('anchor_not_found', details) };
  }
  if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > matches.length) {
    return { placement: null, issue: placementIssue('anchor_occurrence_out_of_range', details) };
  }
  const match = matches[occurrence - 1];
  if (!match) {
    return { placement: null, issue: placementIssue('anchor_occurrence_out_of_range', details) };
  }
  const size = fieldSize(kind, anchor.width, anchor.height);
  const box = anchorFieldBox(match.run, size, anchor);
  return {
    placement: resolvedFrom(
      field,
      index,
      kind,
      match.page,
      box,
      `anchor:${anchor.text}#${occurrence}`,
      doc,
    ),
    issue: null,
  };
}

function matchingFormFields(
  doc: LoadedDocument,
  name: string,
  page: number | undefined,
): readonly LoadedFormField[] {
  return doc.formFields.filter((widget) => {
    if (widget.name !== name) return false;
    if (page !== undefined && widget.page !== page) return false;
    return true;
  });
}

function resolveFormField(
  field: PlacementFieldInput,
  index: number,
  doc: LoadedDocument,
): { readonly placement: ResolvedPlacement | null; readonly issue: PlacementIssue | null } {
  const locator = field.form_field;
  if (!locator) return { placement: null, issue: invalid(field, index) };
  const matches = matchingFormFields(doc, locator.name, locator.page);
  const details = {
    field_id:
      field.client_ref !== undefined && field.client_ref.length > 0
        ? field.client_ref
        : `field:${index}`,
    signer_id: field.signer_id,
    match_count: matches.length,
    ...(field.client_ref !== undefined ? { client_ref: field.client_ref } : {}),
  };
  const widget = matches[0];
  if (!widget) return { placement: null, issue: placementIssue('form_field_not_found', details) };
  if (matches.length > 1) {
    return { placement: null, issue: placementIssue('form_field_ambiguous', details) };
  }
  let kind: PlacementKind;
  if (field.kind === undefined) kind = widget.suggested_kind;
  else if (isPlacementKind(field.kind)) kind = field.kind;
  else return { placement: null, issue: invalid(field, index) };
  return {
    placement: resolvedFrom(
      field,
      index,
      kind,
      widget.page,
      widget.box,
      `form_field:${locator.name}`,
      doc,
    ),
    issue: null,
  };
}

/**
 * Resolve every locator. A bad locator becomes an issue and does not
 * throw, so later fields in the same call still resolve.
 */
export function resolvePlacementFields(
  inputs: readonly PlacementFieldInput[],
  doc: LoadedDocument,
): ResolveResult {
  const resolved: ResolvedPlacement[] = [];
  const issues: PlacementIssue[] = [];
  inputs.forEach((field, index) => {
    if (locatorCount(field) !== 1) {
      issues.push(invalid(field, index));
      return;
    }
    if (field.form_field !== undefined) {
      const form = resolveFormField(field, index, doc);
      if (form.issue) issues.push(form.issue);
      if (form.placement) resolved.push(form.placement);
      return;
    }
    if (field.kind === undefined || !isPlacementKind(field.kind)) {
      issues.push(invalid(field, index));
      return;
    }
    if (field.box !== undefined) {
      resolved.push(resolveBox(field, index, field.kind, doc));
      return;
    }
    const anchor = resolveAnchor(field, index, field.kind, doc);
    if (anchor.issue) issues.push(anchor.issue);
    if (anchor.placement) resolved.push(anchor.placement);
  });
  return { resolved, issues };
}
