import { BadRequestException } from '@nestjs/common';
import { EnvelopesDocumentsOutputSchema, EnvelopesReorderDocumentsInputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { toMcpDocument } from '../envelope-mappers';
import { WRITE_ANNOTATIONS, requireDraft } from './draft-helpers';

/**
 * `envelopes_reorder_documents` → `EnvelopeDocumentsService.reorder`, as
 * `PUT /envelopes/:id/documents/order` (WP-03; step 8c).
 */
export const envelopesReorderDocumentsTool = defineWriteTool({
  name: 'envelopes_reorder_documents',
  title: 'Reorder documents',
  description:
    'Puts the documents of a draft in a new order. document_ids lists every document of the envelope once; the first becomes document 1. Fields stay on their documents. Requires idempotency_key and dry_run.',
  step: 'step-8c',
  scopes: ['envelopes:write'],
  annotations: WRITE_ANNOTATIONS,
  requiresFlags: ['multiDocumentEnvelopes'],
  input: EnvelopesReorderDocumentsInputSchema,
  output: EnvelopesDocumentsOutputSchema,
  preview: async (args, ctx) => {
    const envelope = await requireDraft(ctx, args.envelope_id);
    const current = new Set((envelope.documents ?? []).map((d) => d.id));
    const given = new Set(args.document_ids);
    if (
      given.size !== args.document_ids.length ||
      given.size !== current.size ||
      [...given].some((id) => !current.has(id))
    ) {
      throw new BadRequestException('document_order_invalid');
    }
    return { envelope_id: envelope.id, document_ids: args.document_ids };
  },
  handler: async (args, ctx) => {
    const documents = await ctx.services.documents.reorder(
      ctx.principal.ownerId,
      args.envelope_id,
      args.document_ids,
    );
    return { documents: documents.map(toMcpDocument) };
  },
});
