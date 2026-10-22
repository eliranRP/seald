import { BadRequestException } from '@nestjs/common';
import {
  EnvelopesPlaceFieldsInputSchema,
  EnvelopesPlaceFieldsOutputSchema,
  isFeatureEnabled,
  type Envelope,
  type McpFieldPlacement,
} from 'shared';
import {
  normalizeFieldPlacements,
  type FieldPlacementInput,
  type NormalizedFieldPlacement,
} from '../../../envelopes/field-placement.service';
import type { McpToolContext } from '../../tool';
import { defineWriteTool } from '../../tool';
import { toMcpField } from '../envelope-mappers';
import { DESTRUCTIVE_ANNOTATIONS, requireDraft } from './draft-helpers';

const MULTI_DOC = 'multiDocumentEnvelopes' as const;

/** MCP placement → the `PUT /envelopes/:id/fields` placement the controller builds. */
export function toPlacementInput(f: McpFieldPlacement): FieldPlacementInput {
  if (f.document_id !== undefined && !isFeatureEnabled(MULTI_DOC)) {
    // Flag off: the legacy DTO rejects `document_id` like any unknown key.
    throw new BadRequestException('validation_error');
  }
  return {
    signer_id: f.signer_id,
    kind: f.kind,
    page: f.page,
    x: f.x,
    y: f.y,
    ...(f.width !== undefined ? { width: f.width } : {}),
    ...(f.height !== undefined ? { height: f.height } : {}),
    ...(f.required !== undefined ? { required: f.required } : {}),
    ...(f.document_id !== undefined ? { document_id: f.document_id } : {}),
    ...(f.meta !== undefined ? { meta: f.meta } : {}),
  };
}

/** A placed field as a placement, so `append` can keep it (link and meta included). */
function keepPlaced(f: Envelope['fields'][number]): FieldPlacementInput {
  return {
    signer_id: f.signer_id,
    kind: f.kind,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width ?? null,
    height: f.height ?? null,
    required: f.required,
    link_id: f.link_id ?? null,
    ...(isFeatureEnabled(MULTI_DOC) && f.document_id !== undefined
      ? { document_id: f.document_id }
      : {}),
    ...(isFeatureEnabled('fieldMetaV2') && f.meta !== undefined ? { meta: f.meta } : {}),
  };
}

/**
 * `EnvelopesService.replaceFields` with the controller's document check
 * while multi-document envelopes are on, then the same `document_id`
 * decoration the route returns.
 */
export async function replaceFields(
  ctx: McpToolContext,
  envelope_id: string,
  placements: readonly NormalizedFieldPlacement[],
): Promise<ReturnType<typeof toMcpField>[]> {
  const owner = ctx.principal.ownerId;
  if (!isFeatureEnabled(MULTI_DOC)) {
    const fields = await ctx.services.envelopes.replaceFields(owner, envelope_id, placements);
    return (await ctx.services.documents.decorateFields(envelope_id, fields)).map(toMcpField);
  }
  const fields = await ctx.services.envelopes.replaceFields(
    owner,
    envelope_id,
    placements,
    (input) => ctx.services.documents.assertFieldDocuments(envelope_id, input),
  );
  return (await ctx.services.documents.decorateFields(envelope_id, fields)).map(toMcpField);
}

/** `envelopes_place_fields` → `PUT /envelopes/:id/fields` (step 8c; WP-20 adds suggestions). */
export const envelopesPlaceFieldsTool = defineWriteTool({
  name: 'envelopes_place_fields',
  title: 'Place fields',
  description:
    'Places fields on a draft. Each field names its signer_id, its document_id (default: the first document), kind, 1-based page and x, y, width, height from 0 to 1 measured from the top-left. mode replace (default) swaps every field on the envelope; append keeps the placed ones. Every signer must already be on the draft. No field values are set. Requires idempotency_key and dry_run.',
  step: 'step-8c',
  scopes: ['envelopes:write'],
  annotations: DESTRUCTIVE_ANNOTATIONS,
  input: EnvelopesPlaceFieldsInputSchema,
  output: EnvelopesPlaceFieldsOutputSchema,
  preview: async (args, ctx) => {
    const envelope = await requireDraft(ctx, args.envelope_id);
    const signerIds = new Set(envelope.signers.map((s) => s.id));
    const docIds = new Set((envelope.documents ?? []).map((d) => d.id));
    for (const f of args.fields) {
      toPlacementInput(f);
      if (!signerIds.has(f.signer_id)) throw new BadRequestException('signer_not_in_envelope');
      if (f.document_id !== undefined && !docIds.has(f.document_id)) {
        throw new BadRequestException('document_not_in_envelope');
      }
    }
    const mode = args.mode ?? 'replace';
    return {
      envelope_id: envelope.id,
      mode,
      fields_after: (mode === 'append' ? envelope.fields.length : 0) + args.fields.length,
    };
  },
  handler: async (args, ctx) => {
    const added = args.fields.map(toPlacementInput);
    let inputs = added;
    if (args.mode === 'append') {
      const envelope = await requireDraft(ctx, args.envelope_id);
      inputs = [...envelope.fields.map(keepPlaced), ...added];
    }
    const fields = await replaceFields(ctx, args.envelope_id, normalizeFieldPlacements(inputs));
    return { fields };
  },
});
