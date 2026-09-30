import { isFeatureEnabled } from 'shared';
import { displayedBoxToStored, storedBoxToDisplayed } from './displayed-page';
import { FieldPlacementDisabledError, FieldPlacementError } from './field-placement.errors';
import type {
  DisplayedBox,
  DocumentInspection,
  FieldIssue,
  FieldPatch,
  FieldTypeInput,
  PlacedField,
  PlacementInput,
  PlacementResult,
  PreviewPage,
  SignerRef,
} from './field-placement.types';
import { loadPdf, type LoadedPdf, type PageGeometry } from './pdf-document';
import { renderPdfPage } from './pdfjs-host';
import { assertFieldCount, mapFieldType, resolvePlacement } from './place-fields';
import { PREVIEW_SCALE, renderPagePreview } from './render-preview';
import { stampDisplayedBoxes } from './stamp-box';
import { validatePlacedFields } from './validate-fields';

export interface DocumentBytesSource {
  getBytes(documentId: string): Promise<Uint8Array>;
}

export class MemoryDocumentSource implements DocumentBytesSource {
  constructor(private readonly docs: ReadonlyMap<string, Uint8Array>) {}

  async getBytes(documentId: string): Promise<Uint8Array> {
    const bytes = this.docs.get(documentId);
    if (!bytes) {
      throw new FieldPlacementError('document_not_found', `No document "${documentId}".`);
    }
    return bytes;
  }
}

interface Session {
  readonly fields: readonly PlacedField[];
  readonly signerIds: readonly string[];
}

/**
 * Field placement for the Seald MCP. No transport: a later tool layer
 * calls these methods. Every method 404s while `mcpServer` is off.
 *
 * Coordinates in and out of `placeFields` (the `box` on each result)
 * are PDF points from the top-left of the displayed page. The stored
 * `x` / `y` / `width` / `height` are envelope_fields fractions of that
 * page.
 */
export class FieldPlacementEngine {
  private readonly loaded = new Map<string, Promise<LoadedPdf>>();
  private readonly sessions = new Map<string, Session>();
  private readonly fieldIndex = new Map<string, string>();

  constructor(private readonly documents: DocumentBytesSource) {}

  async inspectDocument(documentId: string): Promise<DocumentInspection> {
    this.assertEnabled();
    const doc = await this.load(documentId);
    return doc.inspection;
  }

  async placeFields(
    documentId: string,
    inputs: readonly PlacementInput[],
  ): Promise<PlacementResult> {
    this.assertEnabled();
    assertFieldCount(inputs.length);
    const doc = await this.load(documentId);
    const colors = new Map<string, string>();
    const fields: PlacedField[] = [];
    const errors: FieldIssue[] = [];
    const requested = new Map<string, DisplayedBox>();
    for (const input of inputs) {
      const resolved = resolvePlacement(
        input,
        doc.pages,
        doc.inspection.textRuns,
        doc.inspection.acroFormFields,
        colors,
      );
      if (resolved.error) errors.push(resolved.error);
      if (!resolved.field || !resolved.requested) continue;
      fields.push(resolved.field);
      requested.set(resolved.field.id, resolved.requested);
    }
    const signerIds = uniqueSignerIds(inputs);
    this.remember(documentId, fields, signerIds);
    const validation = validatePlacedFields({
      pages: doc.inspection.pages,
      textRuns: doc.inspection.textRuns,
      fields,
      signerIds,
      requestedBoxes: requested,
    });
    return { fields, errors, validation };
  }

  async validateFields(
    documentId: string,
    fields: readonly PlacedField[],
    options?: { readonly signerIds?: readonly string[] },
  ): Promise<PlacementResult['validation']> {
    this.assertEnabled();
    const doc = await this.load(documentId);
    const signerIds = options?.signerIds;
    return validatePlacedFields({
      pages: doc.inspection.pages,
      textRuns: doc.inspection.textRuns,
      fields,
      ...(signerIds ? { signerIds } : {}),
    });
  }

  async renderPreview(
    documentId: string,
    fields: readonly PlacedField[],
    pages?: readonly number[],
  ): Promise<readonly PreviewPage[]> {
    this.assertEnabled();
    const doc = await this.load(documentId);
    const wanted = pages ?? doc.pages.map((page) => page.info.page);
    const rendered: PreviewPage[] = [];
    for (const pageNumber of wanted) {
      const geometry = doc.pages.find((page) => page.info.page === pageNumber);
      if (!geometry) {
        throw new FieldPlacementError(
          'page_not_found',
          `Page ${pageNumber} is not in this document.`,
        );
      }
      const background = await renderPdfPage(doc.bytes, pageNumber, PREVIEW_SCALE);
      rendered.push(await renderPagePreview(background.png, pageNumber, fields));
    }
    return rendered;
  }

  /**
   * Move or retype a field from the last `placeFields` call on its
   * document. `x` / `y` / `w` / `h` are displayed points. Returns the
   * full field list so the caller can render again.
   */
  async updateField(id: string, patch: FieldPatch): Promise<readonly PlacedField[]> {
    this.assertEnabled();
    const documentId = this.fieldIndex.get(id);
    if (!documentId) {
      throw new FieldPlacementError('field_not_found', `No placed field "${id}".`);
    }
    const session = this.sessions.get(documentId);
    const doc = await this.load(documentId);
    if (!session) {
      throw new FieldPlacementError('field_not_found', `No placed field "${id}".`);
    }
    const current = session.fields.find((field) => field.id === id);
    if (!current) {
      throw new FieldPlacementError('field_not_found', `No placed field "${id}".`);
    }
    const next = await this.applyPatch(current, patch, doc);
    const fields = session.fields.map((field) => (field.id === id ? next : field));
    this.remember(documentId, fields, session.signerIds);
    return fields;
  }

  /**
   * Copy of the PDF with each field's box stroked in user space.
   * Proves the displayed-page helper, and is not the production seal.
   */
  async stampFieldProof(documentId: string, fields: readonly PlacedField[]): Promise<Uint8Array> {
    this.assertEnabled();
    const doc = await this.load(documentId);
    const targets = [];
    for (const field of fields) {
      const geometry = doc.pages.find((page) => page.info.page === field.page);
      if (!geometry) {
        throw new FieldPlacementError(
          'page_not_found',
          `Page ${field.page} is not in this document.`,
        );
      }
      targets.push({ page: field.page, viewport: geometry.viewport, box: field.box });
    }
    return stampDisplayedBoxes(doc.bytes, targets);
  }

  private async applyPatch(
    current: PlacedField,
    patch: FieldPatch,
    doc: LoadedPdf,
  ): Promise<PlacedField> {
    const type = patch.type ?? storedType(current);
    const signer: SignerRef = {
      id: patch.signer?.id ?? current.signer_id,
      name: patch.signer?.name ?? current.signer_name,
      color: patch.signer?.color ?? current.signer_color,
    };
    if (patch.anchor || patch.acroformField) {
      const input: PlacementInput = patch.anchor
        ? {
            type,
            signer,
            required: patch.required ?? current.required,
            anchor: patch.anchor,
            ...(patch.w !== undefined && patch.h !== undefined ? { w: patch.w, h: patch.h } : {}),
          }
        : {
            type,
            signer,
            required: patch.required ?? current.required,
            acroformField: patch.acroformField ?? '',
          };
      const resolved = resolvePlacement(
        input,
        doc.pages,
        doc.inspection.textRuns,
        doc.inspection.acroFormFields,
        new Map([[signer.id, signer.color ?? current.signer_color]]),
        current.id,
      );
      if (resolved.error || !resolved.field) {
        throw new FieldPlacementError(
          resolved.error?.code ?? 'invalid_placement',
          resolved.error?.message ?? 'Could not update the field.',
        );
      }
      return resolved.field;
    }
    const pageNumber = patch.page ?? current.page;
    const geometry = doc.pages.find((page) => page.info.page === pageNumber);
    if (!geometry) {
      throw new FieldPlacementError(
        'page_not_found',
        `Page ${pageNumber} is not in this document.`,
      );
    }
    return retarget(current, geometry, {
      x: patch.x ?? current.box.x,
      y: patch.y ?? current.box.y,
      w: patch.w ?? current.box.w,
      h: patch.h ?? current.box.h,
      type,
      signer,
      required: patch.required ?? current.required,
    });
  }

  private assertEnabled(): void {
    if (!isFeatureEnabled('mcpServer')) throw new FieldPlacementDisabledError();
  }

  private load(documentId: string): Promise<LoadedPdf> {
    const cached = this.loaded.get(documentId);
    if (cached) return cached;
    const pending = this.documents.getBytes(documentId).then((bytes) => loadPdf(documentId, bytes));
    this.loaded.set(documentId, pending);
    void pending.catch(() => {
      this.loaded.delete(documentId);
    });
    return pending;
  }

  private remember(
    documentId: string,
    fields: readonly PlacedField[],
    signerIds: readonly string[],
  ): void {
    const previous = this.sessions.get(documentId);
    if (previous) {
      for (const field of previous.fields) this.fieldIndex.delete(field.id);
    }
    this.sessions.set(documentId, { fields, signerIds });
    for (const field of fields) this.fieldIndex.set(field.id, documentId);
  }
}

function uniqueSignerIds(inputs: readonly PlacementInput[]): string[] {
  const ids: string[] = [];
  for (const input of inputs) {
    if (!ids.includes(input.signer.id)) ids.push(input.signer.id);
  }
  return ids;
}

function storedType(field: PlacedField): FieldTypeInput {
  if (field.kind === 'text' && field.link_id === 'name') return 'name';
  return field.kind;
}

function retarget(
  current: PlacedField,
  page: PageGeometry,
  next: {
    x: number;
    y: number;
    w: number;
    h: number;
    type: FieldTypeInput;
    signer: SignerRef;
    required: boolean;
  },
): PlacedField {
  const mapped = mapFieldType(next.type);
  const stored = displayedBoxToStored({ x: next.x, y: next.y, w: next.w, h: next.h }, page.info);
  const width = stored.width ?? 0;
  const height = stored.height ?? 0;
  const color =
    next.signer.color && /^#[0-9A-Fa-f]{6}$/.test(next.signer.color)
      ? next.signer.color
      : current.signer_color;
  return {
    id: current.id,
    signer_id: next.signer.id,
    signer_name:
      next.signer.name && next.signer.name.length > 0 ? next.signer.name : next.signer.id,
    signer_color: color,
    kind: mapped.kind,
    link_id: mapped.linkId,
    page: page.info.page,
    x: stored.x,
    y: stored.y,
    width,
    height,
    required: next.required,
    box: storedBoxToDisplayed({ x: stored.x, y: stored.y, width, height }, page.info),
  };
}
