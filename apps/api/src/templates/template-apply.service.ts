import { Injectable } from '@nestjs/common';
import {
  expandTemplateLayout,
  type ExpandedTemplateField,
  type TemplateFieldType,
  type TemplateLastSigner,
} from 'shared';
import type { FieldKind } from 'shared';
import { EnvelopesService } from '../envelopes/envelopes.service';
import type { EnvelopeField } from '../envelopes/envelope.entity';
import {
  normalizeFieldPlacements,
  type FieldPlacementInput,
} from '../envelopes/field-placement.service';
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
 * The draft has no page count or no signers, so the layout cannot be
 * placed. This is not an HTTP response; nothing mounts this service
 * on a route.
 */
export class TemplateApplyNotReadyError extends Error {
  readonly code = 'template_apply_not_ready' as const;
  constructor(reason: 'missing_pages' | 'no_signers') {
    super(reason);
    this.name = 'TemplateApplyNotReadyError';
  }
}

export interface TemplateApplyResult {
  readonly template_id: string;
  readonly uses_count: number;
  readonly fields: readonly EnvelopeField[];
}

interface SignerRef {
  readonly id: string;
  readonly email: string;
}

/**
 * Applies a template layout onto a draft envelope.
 *
 * `POST /templates/:id/use` still only bumps `uses_count`. This service
 * is the server-side expansion the browser used to do, for a later
 * `templates_use` tool. It is not wired to that route.
 *
 * Stored template coordinates are PDF points and may be greater than 1.
 * They are passed through. `replaceFields` does not clamp them, and this
 * service does not convert them to the 0–1 place-fields range.
 *
 * `uses_count` increments only after `replaceFields` succeeds.
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

    const expanded = expandTemplateLayout(template.field_layout, totalPages, template.last_signers);
    const placements = assignTemplateFields(expanded, template.last_signers, envelope.signers);
    const stored = await this.envelopes.replaceFields(
      ownerId,
      envelopeId,
      normalizeFieldPlacements(placements),
    );
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
      return type;
    default: {
      const unexpected: never = type;
      return unexpected;
    }
  }
}

function emailsLineUp(
  lastSigners: ReadonlyArray<TemplateLastSigner>,
  signers: ReadonlyArray<SignerRef>,
): boolean {
  if (lastSigners.length === 0 || lastSigners.length !== signers.length) return false;
  return lastSigners.every((row, index) => {
    const signer = signers[index];
    return signer !== undefined && row.email.toLowerCase() === signer.email.toLowerCase();
  });
}

/**
 * When `last_signers` and the envelope signers are the same list (same
 * length, emails equal in order, case-insensitive), a field follows its
 * `signerRoleId` or `signerIndex`. Otherwise every field goes to the
 * first signer.
 */
function assignTemplateFields(
  fields: ReadonlyArray<ExpandedTemplateField>,
  lastSigners: ReadonlyArray<TemplateLastSigner>,
  signers: ReadonlyArray<SignerRef>,
): FieldPlacementInput[] {
  const first = signers[0];
  if (!first) throw new TemplateApplyNotReadyError('no_signers');
  const linedUp = emailsLineUp(lastSigners, signers);
  return fields.map((field) => {
    const signerId = linedUp ? signerIdForField(field, lastSigners, signers, first.id) : first.id;
    const placement: FieldPlacementInput = {
      signer_id: signerId,
      kind: toEnvelopeKind(field.type),
      page: field.page,
      x: field.x,
      y: field.y,
      ...(field.linkId !== undefined ? { link_id: field.linkId } : {}),
    };
    return placement;
  });
}

function signerIdForField(
  field: ExpandedTemplateField,
  lastSigners: ReadonlyArray<TemplateLastSigner>,
  signers: ReadonlyArray<SignerRef>,
  fallbackId: string,
): string {
  let index: number | undefined;
  if (field.signerRoleId !== undefined) {
    const found = lastSigners.findIndex((row) => row.id === field.signerRoleId);
    if (found >= 0) index = found;
  }
  if (index === undefined && field.signerIndex !== undefined) {
    index = field.signerIndex;
  }
  if (index === undefined) return fallbackId;
  return signers[index]?.id ?? fallbackId;
}
