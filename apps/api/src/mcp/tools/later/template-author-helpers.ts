import { BadRequestException } from '@nestjs/common';
import {
  McpTemplateFieldInputSchema,
  McpTemplateSignerInputSchema,
  isFeatureEnabled,
  type DeliveryMode,
  type McpTemplate,
  type Template,
} from 'shared';
import type { z } from 'zod';
import type { UpdateTemplateDto } from '../../../templates/dto/update-template.dto';
import { templateShape } from '../templates/template-helpers';

type FieldInput = z.infer<typeof McpTemplateFieldInputSchema>;
type SignerInput = z.infer<typeof McpTemplateSignerInputSchema>;
type Body = {
  readonly title?: string | undefined;
  readonly description?: string | null | undefined;
  readonly cover_color?: string | null | undefined;
  readonly field_layout?: readonly FieldInput[] | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly last_signers?: readonly SignerInput[] | undefined;
  readonly delivery_mode?: DeliveryMode | undefined;
};

export function toMcpTemplate(t: Template): McpTemplate {
  return {
    template_id: t.id,
    title: t.title,
    description: t.description,
    cover_color: t.cover_color,
    tags: [...t.tags],
    ...(t.delivery_mode !== undefined ? { delivery_mode: t.delivery_mode } : {}),
    fields: t.field_layout.length,
    signer_slots: templateShape(t).slots.length,
    has_example_pdf: t.has_example_pdf,
    uses_count: t.uses_count,
  };
}

/** Same flag rules the HTTP DTO enforces: the order fields exist only while signing order is on. */
export function assertFlags(body: Body): void {
  if (!isFeatureEnabled('signingOrder')) {
    if (body.delivery_mode !== undefined) throw new BadRequestException('validation_error');
    if (body.last_signers?.some((s) => s.signing_order !== undefined)) {
      throw new BadRequestException('validation_error');
    }
  }
}

function dtoField(f: FieldInput): NonNullable<UpdateTemplateDto['field_layout']>[number] {
  return {
    type: f.type,
    pageRule: f.pageRule,
    x: f.x,
    y: f.y,
    ...(f.label !== undefined ? { label: f.label } : {}),
    ...(f.signerIndex !== undefined ? { signerIndex: f.signerIndex } : {}),
    ...(f.signerRoleId !== undefined ? { signerRoleId: f.signerRoleId } : {}),
  };
}

function dtoSigner(s: SignerInput): NonNullable<UpdateTemplateDto['last_signers']>[number] {
  return {
    id: s.id,
    name: s.name,
    email: s.email,
    color: s.color,
    ...(s.signing_order !== undefined ? { signing_order: s.signing_order } : {}),
  };
}

/** Only the keys the caller sent, so an omitted field is never written as undefined. */
export function dtoOf(body: Body): UpdateTemplateDto {
  return {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.cover_color !== undefined ? { cover_color: body.cover_color } : {}),
    ...(body.field_layout !== undefined ? { field_layout: body.field_layout.map(dtoField) } : {}),
    ...(body.tags !== undefined ? { tags: body.tags } : {}),
    ...(body.last_signers !== undefined ? { last_signers: body.last_signers.map(dtoSigner) } : {}),
    ...(body.delivery_mode !== undefined ? { delivery_mode: body.delivery_mode } : {}),
  };
}

export const NOT_A_PDF_NOTE =
  'The example PDF is uploaded in Seald, not through this tool; a template needs one before bulk sending.';
