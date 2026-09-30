import { Injectable } from '@nestjs/common';
import {
  expandTemplateLayout,
  normalizeTemplateFieldBox,
  type ExpandedTemplateField,
  type TemplateFieldType,
} from 'shared';
import type { FieldKind } from 'shared';
import { EnvelopesService } from '../envelopes/envelopes.service';
import type { EnvelopeField } from '../envelopes/envelope.entity';
import type { ApplySignerRef } from '../envelopes/envelopes.repository';
import type { FieldPlacementInput } from '../envelopes/field-placement.service';
import { inspectPdfBytes, type PdfPageSize } from '../envelopes/pdf-inspection';
import { TemplatesService } from './templates.service';

/**
 * The template has a saved layout with no entries. Callers must not
 * count this as a use.
 */
export class TemplateHasNoFieldsError extends Error {
  readonly code = 'template_has_no_fields' as const;
  constructor() {
    super('template_has_no_fields');
    this.name = 'TemplateHasNoFieldsError';
  }
}

/**
 * The draft has no page count, no original PDF, or no signers, so the
 * layout cannot be placed. This is not an HTTP response; nothing mounts
 * this service on a route.
 */
export class TemplateApplyNotReadyError extends Error {
  readonly code = 'template_apply_not_ready' as const;
  constructor(reason: 'missing_pages' | 'no_signers') {
    super(reason);
    this.name = 'TemplateApplyNotReadyError';
  }
}

/**
 * A field names neither a role nor an index, so the browser's
 * first-signer fallback does not apply. Nothing is written and
 * `uses_count` stays put.
 */
export class TemplateRoleUnmappedError extends Error {
  readonly code = 'template_role_unmapped' as const;
  constructor() {
    super('template_role_unmapped');
    this.name = 'TemplateRoleUnmappedError';
  }
}

export interface TemplateApplyResult {
  readonly template_id: string;
  readonly uses_count: number;
  readonly fields: readonly EnvelopeField[];
}

/**
 * Applies a template layout onto a draft envelope.
 *
 * `POST /templates/:id/use` still only bumps `uses_count`. This service
 * is the server-side expansion the browser used to do, for a later
 * `templates_use` tool. It is not wired to that route.
 *
 * Legacy coordinates are 560-grid editor pixels. They become 0–1 with
 * `x / 560` and `y / (560 * displayedHeight / displayedWidth)`, using
 * each page's displayed size from `inspectPdfBytes`. `coordVersion` 2
 * is already that fraction. Width and height default per kind when the
 * row omitted them.
 *
 * `signerRoleId` matches `envelope_signers.contact_id` (the SPA roster
 * id). `expandTemplateLayout` fills a missing role from
 * `last_signers[signerIndex]` first. A role that is not on the envelope
 * is dropped, and so is an out-of-range index. A field with neither is
 * `template_role_unmapped` — not the first signer.
 *
 * `uses_count` increments only after `replaceFields` succeeds. An
 * expansion that places nothing because every page is out of range
 * does not write and does not count as a use. `replaceFields`
 * normalizes the rows; this service does not normalize them again.
 */
@Injectable()
export class TemplateApplyService {
  constructor(
    private readonly templates: TemplatesService,
    private readonly envelopes: EnvelopesService,
  ) {}

  async apply(
    ownerId: string,
    templateId: string,
    envelopeId: string,
  ): Promise<TemplateApplyResult> {
    const template = await this.templates.get(ownerId, templateId);
    if (template.field_layout.length === 0) {
      throw new TemplateHasNoFieldsError();
    }
    const envelope = await this.envelopes.getById(ownerId, envelopeId);
    const totalPages = envelope.original_pages;
    if (totalPages == null) throw new TemplateApplyNotReadyError('missing_pages');
    if (envelope.signers.length === 0) throw new TemplateApplyNotReadyError('no_signers');

    const pdf = await this.envelopes.readOriginalPdf(ownerId, envelopeId);
    const inspected = await inspectPdfBytes(pdf);
    const expanded = expandTemplateLayout(template.field_layout, totalPages, template.last_signers);
    if (expanded.length === 0) throw new TemplateApplyNotReadyError('missing_pages');
    const signers = await this.envelopes.listApplySigners(ownerId, envelopeId);
    if (signers.length === 0) throw new TemplateApplyNotReadyError('no_signers');
    const placements = assignTemplateFields(expanded, signers, inspected.pageSizes);
    const stored = await this.envelopes.replaceFields(ownerId, envelopeId, placements);
    const updated = await this.templates.use(ownerId, templateId);
    return { template_id: updated.id, uses_count: updated.uses_count, fields: stored };
  }
}

function toEnvelopeKind(type: TemplateFieldType): FieldKind {
  switch (type) {
    case 'initial':
      return 'initials';
    case 'signature':
    case 'date':
    case 'text':
    case 'checkbox':
    case 'email':
      return type;
    default: {
      const unexpected: never = type;
      return unexpected;
    }
  }
}

/**
 * Bind like the SPA's `rebindFieldsToSigners`, except a field with
 * neither a role nor an index throws {@link TemplateRoleUnmappedError}
 * instead of using the first signer.
 *
 * A set `signerRoleId` that is not a `contact_id` on the envelope is
 * dropped and does not fall through to `signerIndex`. An index past the
 * roster is dropped.
 */
function assignTemplateFields(
  fields: ReadonlyArray<ExpandedTemplateField>,
  signers: ReadonlyArray<ApplySignerRef>,
  pageSizes: readonly PdfPageSize[],
): FieldPlacementInput[] {
  if (signers.length === 0) throw new TemplateApplyNotReadyError('no_signers');
  const placements: FieldPlacementInput[] = [];
  for (const field of fields) {
    const signerId = signerIdForField(field, signers);
    if (signerId === undefined) continue;
    const page = pageSizes.find((size) => size.page === field.page);
    if (page === undefined || !(page.width > 0) || !(page.height > 0)) {
      throw new TemplateApplyNotReadyError('missing_pages');
    }
    const box = normalizeTemplateFieldBox(field, { width: page.width, height: page.height });
    const placement: FieldPlacementInput = {
      signer_id: signerId,
      kind: toEnvelopeKind(field.type),
      page: field.page,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      ...(field.linkId !== undefined ? { link_id: field.linkId } : {}),
    };
    placements.push(placement);
  }
  return placements;
}

/**
 * `undefined` means drop the field. A field with no role and no index
 * throws instead of binding `signers[0]`.
 */
function signerIdForField(
  field: ExpandedTemplateField,
  signers: ReadonlyArray<ApplySignerRef>,
): string | undefined {
  if (field.signerRoleId !== undefined) {
    const match = signers.find((signer) => signer.contact_id === field.signerRoleId);
    return match?.id;
  }
  if (field.signerIndex !== undefined) {
    if (field.signerIndex < 0 || field.signerIndex >= signers.length) return undefined;
    return signers[field.signerIndex]?.id;
  }
  throw new TemplateRoleUnmappedError();
}
