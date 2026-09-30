import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  nearestTextForBox,
  placementIssue,
  validateFieldPlacement,
  isPlacementKind,
  type PlacementBox,
  type PlacementIssue,
  type PlacementKind,
  type PlacementStage,
  type PlacementTextLine,
  type PlacementValidation,
  type ResolvedPlacementField,
} from 'shared';
import type { FieldKind } from 'shared';
import type { CreateFieldInput, FieldUpdateById } from '../envelopes/envelopes.repository';
import { normalizeFieldPlacements } from '../envelopes/field-placement.service';
import { storedBoxToDisplayed } from './displayed-page';
import { FieldPlacementError } from './field-placement.errors';
import type { LoadedDocument, PageGeometry } from './pdf-document';
import { loadPdf } from './pdf-document';
import { normalizePlacement, resolvePlacementFields, type ResolvedPlacement } from './place-fields';
import type { PlacementEnvelope, PlacementStore, PlacementStoredField } from './placement-store';
import {
  INSPECT_PAGE_LIMIT,
  PLACEMENT_UNITS,
  type FieldUpdateInput,
  type InspectDocumentResult,
  type InspectFormField,
  type InspectPage,
  type InspectTextItem,
  type PlaceFieldsResult,
  type PlacementFieldInput,
  type PlacementFieldOutput,
  type PlacementMode,
} from './field-placement.types';
import { paginatePlacementText, type TextLine, type TextPiece } from './text-index';

function persistKind(
  kind: PlacementKind,
  previousLink: string | null,
): { readonly kind: FieldKind; readonly link_id: string | null } {
  if (kind === 'name') return { kind: 'text', link_id: 'name' };
  return { kind, link_id: previousLink === 'name' ? null : previousLink };
}

function logicalKind(kind: FieldKind, linkId: string | null): PlacementKind {
  if (kind === 'text' && linkId === 'name') return 'name';
  return kind;
}

function textLinesOf(doc: LoadedDocument): PlacementTextLine[] {
  return doc.lines.map((line) => ({ page: line.page, text: line.text, box: line.box }));
}

function pageViewsOf(
  doc: LoadedDocument,
): { page: number; view_width: number; view_height: number }[] {
  return doc.pages.map((page) => ({
    page: page.info.page,
    view_width: page.info.width,
    view_height: page.info.height,
  }));
}

function toValidationField(field: ResolvedPlacement): ResolvedPlacementField {
  return {
    id: field.provisionalId,
    signer_id: field.signerId,
    kind: field.kind,
    required: field.required,
    page: field.page,
    box: field.box,
    ...(field.clientRef !== null ? { client_ref: field.clientRef } : {}),
  };
}

function toOutput(
  field: ResolvedPlacement,
  id: string | null,
  lines: readonly PlacementTextLine[],
): PlacementFieldOutput {
  return {
    id,
    client_ref: field.clientRef,
    label: field.label,
    signer_id: field.signerId,
    kind: field.kind,
    required: field.required,
    page: field.page,
    box: field.box,
    normalized: field.normalized,
    source: field.source,
    nearest_text: nearestTextForBox(field.box, field.page, lines),
  };
}

function fromStored(field: PlacementStoredField, doc: LoadedDocument): ResolvedPlacement {
  const geometry = doc.pages.find((page) => page.info.page === field.page);
  let box: PlacementBox = { x: 0, y: 0, width: 0, height: 0 };
  if (geometry) {
    const pixel = storedBoxToDisplayed(field, {
      width: geometry.info.width,
      height: geometry.info.height,
    });
    box = { x: pixel.x, y: pixel.y, width: pixel.w, height: pixel.h };
  }
  return {
    provisionalId: field.id,
    clientRef: null,
    label: null,
    signerId: field.signer_id,
    kind: logicalKind(field.kind, field.link_id),
    required: field.required,
    page: field.page,
    box,
    normalized: {
      page: field.page,
      x: field.x,
      y: field.y,
      width: field.width ?? 0,
      height: field.height ?? 0,
    },
    source: 'box',
  };
}

function storedToCreate(field: PlacementStoredField): CreateFieldInput {
  return {
    signer_id: field.signer_id,
    kind: field.kind,
    page: field.page,
    x: field.x,
    y: field.y,
    width: field.width,
    height: field.height,
    required: field.required,
    link_id: field.link_id,
  };
}

function resolvedToCreate(field: ResolvedPlacement): CreateFieldInput {
  const stored = persistKind(field.kind, null);
  return {
    signer_id: field.signerId,
    kind: stored.kind,
    page: field.normalized.page,
    x: field.normalized.x,
    y: field.normalized.y,
    width: field.normalized.width,
    height: field.normalized.height,
    required: field.required,
    link_id: stored.link_id,
  };
}

function mergeReport(
  locatorIssues: readonly PlacementIssue[],
  validation: PlacementValidation,
): PlacementValidation {
  const errors = [...locatorIssues, ...validation.errors];
  const envelope_errors = [...errors, ...validation.warnings].filter(
    (issue) =>
      issue.slug === 'signer_without_signature_field' || issue.slug === 'signer_not_in_envelope',
  );
  return { errors, warnings: validation.warnings, envelope_errors, ready: errors.length === 0 };
}

function runValidation(
  fields: readonly ResolvedPlacement[],
  signers: readonly { readonly id: string }[],
  doc: LoadedDocument,
  stage: PlacementStage,
): PlacementValidation {
  return validateFieldPlacement({
    fields: fields.map((field) => toValidationField(field)),
    signers,
    pages: pageViewsOf(doc),
    page_count: doc.pageCount,
    text_lines: textLinesOf(doc),
    stage,
  });
}

function decodeInspectCursor(cursor: string): number {
  const text = Buffer.from(cursor, 'base64url').toString('utf8');
  if (!/^\d+$/.test(text)) throw new BadRequestException('inspect_cursor_invalid');
  return Number(text);
}

function encodeInspectCursor(index: number): string {
  return Buffer.from(String(index), 'utf8').toString('base64url');
}

function pieceItem(piece: TextPiece): InspectTextItem {
  return { page: piece.page, text: piece.text, box: piece.box };
}

function lineItem(line: TextLine): InspectTextItem {
  return { page: line.page, text: line.text, box: line.box };
}

interface OpenedPlacement {
  readonly envelope: PlacementEnvelope;
  readonly doc: LoadedDocument;
}

/**
 * Stateless inspect / place / validate / update. Bound to an envelope
 * through `PlacementStore`. No PDF cache and no session. Not mounted
 * from AppModule; the seal still converts coordinates in displayed-page.ts.
 */
@Injectable()
export class FieldPlacementService {
  constructor(private readonly store: PlacementStore) {}

  async inspectDocument(input: {
    readonly owner_id: string;
    readonly envelope_id: string;
    readonly pages?: readonly number[];
    readonly text_granularity?: 'word' | 'line';
    readonly cursor?: string;
  }): Promise<InspectDocumentResult> {
    const { doc } = await this.open(input.owner_id, input.envelope_id);
    const selected = this.selectPages(doc, input.pages);
    const pageNumbers = new Set(selected.map((page) => page.info.page));
    const granularity = input.text_granularity === 'word' ? 'word' : 'line';
    const textSource =
      granularity === 'word'
        ? doc.words.filter((piece) => pageNumbers.has(piece.page)).map(pieceItem)
        : doc.lines.filter((line) => pageNumbers.has(line.page)).map(lineItem);
    const start = input.cursor === undefined ? 0 : decodeInspectCursor(input.cursor);
    const page = paginatePlacementText(textSource, start);
    const form_fields: InspectFormField[] = doc.formFields
      .filter((widget) => pageNumbers.has(widget.page))
      .map((widget) => ({
        page: widget.page,
        name: widget.name,
        type: widget.type,
        box: widget.box,
        suggested_kind: widget.suggested_kind,
      }));
    const pages: InspectPage[] = selected.map((geometry) => ({
      page: geometry.info.page,
      view_width: geometry.info.width,
      view_height: geometry.info.height,
      rotation: geometry.info.rotation,
      mediabox: geometry.info.mediaBox,
      cropbox: geometry.info.cropBox,
    }));
    return {
      page_count: doc.pageCount,
      units: PLACEMENT_UNITS,
      pages,
      text: page.slice,
      text_granularity: granularity,
      next_cursor: page.nextIndex === null ? null : encodeInspectCursor(page.nextIndex),
      form_fields,
    };
  }

  async placeFields(input: {
    readonly owner_id: string;
    readonly envelope_id: string;
    readonly fields: readonly PlacementFieldInput[];
    readonly mode?: PlacementMode;
    readonly dry_run?: boolean;
  }): Promise<PlaceFieldsResult> {
    const opened = await this.open(input.owner_id, input.envelope_id);
    this.assertDraft(opened.envelope);
    const mode = input.mode === 'append' ? 'append' : 'replace';
    const { resolved, issues } = resolvePlacementFields(input.fields, opened.doc);
    const existing =
      mode === 'append' ? opened.envelope.fields.map((field) => fromStored(field, opened.doc)) : [];
    const combined = [...existing, ...resolved];
    const lines = textLinesOf(opened.doc);
    const report = mergeReport(
      issues,
      runValidation(combined, opened.envelope.signers, opened.doc, 'place'),
    );
    if (input.dry_run === true || !report.ready) {
      return {
        fields: combined.map((field, index) =>
          toOutput(field, index < existing.length ? field.provisionalId : null, lines),
        ),
        report,
        persisted: false,
      };
    }
    const prefix = mode === 'append' ? opened.envelope.fields.map(storedToCreate) : [];
    const written = await this.store.replaceFields(
      input.owner_id,
      input.envelope_id,
      normalizeFieldPlacements([...prefix, ...resolved.map(resolvedToCreate)]),
    );
    const fields = written.map((row, index) => {
      const created = index >= prefix.length ? resolved[index - prefix.length] : undefined;
      if (created) {
        return toOutput({ ...created, provisionalId: row.id }, row.id, lines);
      }
      return toOutput(fromStored(row, opened.doc), row.id, lines);
    });
    return {
      fields,
      report: runValidation(
        fields.map((field) => outputAsResolved(field)),
        opened.envelope.signers,
        opened.doc,
        'place',
      ),
      persisted: true,
    };
  }

  async validateFields(input: {
    readonly owner_id: string;
    readonly envelope_id: string;
    readonly stage?: PlacementStage;
  }): Promise<{
    readonly fields: readonly PlacementFieldOutput[];
    readonly report: PlacementValidation;
  }> {
    const opened = await this.open(input.owner_id, input.envelope_id);
    const stage = input.stage ?? 'place';
    const resolved = opened.envelope.fields.map((field) => fromStored(field, opened.doc));
    const lines = textLinesOf(opened.doc);
    return {
      fields: resolved.map((field) => toOutput(field, field.provisionalId, lines)),
      report: runValidation(resolved, opened.envelope.signers, opened.doc, stage),
    };
  }

  async updateFields(input: {
    readonly owner_id: string;
    readonly envelope_id: string;
    readonly updates: readonly FieldUpdateInput[];
    readonly remove?: readonly string[];
  }): Promise<PlaceFieldsResult> {
    const opened = await this.open(input.owner_id, input.envelope_id);
    this.assertDraft(opened.envelope);
    const remove = new Set(input.remove ?? []);
    const known = new Set(opened.envelope.fields.map((field) => field.id));
    for (const id of remove) {
      if (!known.has(id)) throw new NotFoundException('field_not_found');
    }
    for (const update of input.updates) {
      if (remove.has(update.field_id)) continue;
      if (!known.has(update.field_id)) throw new NotFoundException('field_not_found');
    }
    const issues: PlacementIssue[] = [];
    const projected = opened.envelope.fields
      .filter((field) => !remove.has(field.id))
      .map((field) =>
        this.applyUpdate(fromStored(field, opened.doc), input.updates, opened.doc, issues),
      );
    const lines = textLinesOf(opened.doc);
    const report = mergeReport(
      issues,
      runValidation(projected, opened.envelope.signers, opened.doc, 'place'),
    );
    const fields = projected.map((field) => toOutput(field, field.provisionalId, lines));
    if (!report.ready) return { fields, report, persisted: false };
    const previousById = new Map(opened.envelope.fields.map((field) => [field.id, field]));
    const patches: FieldUpdateById[] = [];
    for (const update of input.updates) {
      if (remove.has(update.field_id)) continue;
      const next = projected.find((field) => field.provisionalId === update.field_id);
      const previous = previousById.get(update.field_id);
      if (!next || !previous) continue;
      const stored = persistKind(next.kind, previous.link_id);
      patches.push({
        field_id: next.provisionalId,
        signer_id: next.signerId,
        kind: stored.kind,
        page: next.normalized.page,
        x: next.normalized.x,
        y: next.normalized.y,
        width: next.normalized.width,
        height: next.normalized.height,
        required: next.required,
        link_id: stored.link_id,
      });
    }
    const written = await this.store.updateFieldsById(input.envelope_id, patches, [...remove]);
    const writtenResolved = written.map((field) => fromStored(field, opened.doc));
    return {
      fields: writtenResolved.map((field) => toOutput(field, field.provisionalId, lines)),
      report: runValidation(writtenResolved, opened.envelope.signers, opened.doc, 'place'),
      persisted: true,
    };
  }

  private applyUpdate(
    field: ResolvedPlacement,
    updates: readonly FieldUpdateInput[],
    doc: LoadedDocument,
    issues: PlacementIssue[],
  ): ResolvedPlacement {
    const update = [...updates]
      .reverse()
      .find((candidate) => candidate.field_id === field.provisionalId);
    if (!update) return field;
    let kind = field.kind;
    if (update.kind !== undefined) {
      if (!isPlacementKind(update.kind)) {
        issues.push(
          placementIssue('invalid_field_locator', {
            field_id: field.provisionalId,
            signer_id: field.signerId,
            page: field.page,
          }),
        );
        return field;
      }
      kind = update.kind;
    }
    let page = field.page;
    let box = field.box;
    if (update.box !== undefined) {
      if (update.box.page !== undefined) page = update.box.page;
      box = {
        x: update.box.x,
        y: update.box.y,
        width: update.box.width ?? box.width,
        height: update.box.height ?? box.height,
      };
    }
    if (update.dx !== undefined) box = { ...box, x: box.x + update.dx };
    if (update.dy !== undefined) box = { ...box, y: box.y + update.dy };
    if (update.width !== undefined) box = { ...box, width: update.width };
    if (update.height !== undefined) box = { ...box, height: update.height };
    return {
      ...field,
      signerId: update.signer_id ?? field.signerId,
      kind,
      required: update.required ?? field.required,
      page,
      box,
      normalized: normalizePlacement(page, box, doc),
    };
  }

  private selectPages(
    doc: LoadedDocument,
    requested: readonly number[] | undefined,
  ): PageGeometry[] {
    if (requested === undefined) return doc.pages.slice(0, INSPECT_PAGE_LIMIT);
    if (requested.length > INSPECT_PAGE_LIMIT) throw new BadRequestException('inspect_pages_limit');
    const selected: PageGeometry[] = [];
    const seen = new Set<number>();
    for (const pageNumber of requested) {
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.pageCount) {
        throw new BadRequestException('inspect_page_out_of_range');
      }
      if (seen.has(pageNumber)) continue;
      seen.add(pageNumber);
      const found = doc.pages.find((page) => page.info.page === pageNumber);
      if (!found) throw new BadRequestException('inspect_page_out_of_range');
      selected.push(found);
    }
    return selected;
  }

  private assertDraft(envelope: PlacementEnvelope): void {
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');
  }

  private async open(owner_id: string, envelope_id: string): Promise<OpenedPlacement> {
    const envelope = await this.store.load(owner_id, envelope_id);
    if (!envelope.original_file_path) throw new BadRequestException('file_not_ready');
    const bytes = await this.store.download(envelope.original_file_path);
    try {
      return { envelope, doc: await loadPdf(bytes) };
    } catch (err) {
      if (err instanceof FieldPlacementError && err.code === 'inspect_timeout') {
        throw new BadRequestException('inspect_timeout');
      }
      if (err instanceof FieldPlacementError) throw err;
      if (err instanceof HttpException) throw err;
      throw new BadRequestException('file_not_ready');
    }
  }
}

function outputAsResolved(field: PlacementFieldOutput): ResolvedPlacement {
  return {
    provisionalId: field.id ?? field.client_ref ?? 'field',
    clientRef: field.client_ref,
    label: field.label,
    signerId: field.signer_id,
    kind: field.kind,
    required: field.required,
    page: field.page,
    box: field.box,
    normalized: field.normalized,
    source: field.source,
  };
}
