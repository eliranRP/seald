import { ConflictException, NotFoundException } from '@nestjs/common';
import { EnvelopesRemoveDocumentInputSchema, McpRemovedOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { DESTRUCTIVE_ANNOTATIONS, requireDraft } from './draft-helpers';

/**
 * `envelopes_remove_document` → `EnvelopeDocumentsService.remove`, as
 * `DELETE /envelopes/:id/documents/:document_id` (WP-03; step 8c).
 */
export const envelopesRemoveDocumentTool = defineWriteTool({
  name: 'envelopes_remove_document',
  title: 'Remove a document',
  description:
    "Removes one document from a draft, with that document's fields. A draft keeps at least one document (last_document). Requires idempotency_key and dry_run.",
  step: 'step-8c',
  scopes: ['envelopes:write'],
  annotations: DESTRUCTIVE_ANNOTATIONS,
  requiresFlags: ['multiDocumentEnvelopes'],
  input: EnvelopesRemoveDocumentInputSchema,
  output: McpRemovedOutputSchema,
  preview: async (args, ctx) => {
    const envelope = await requireDraft(ctx, args.envelope_id);
    const docs = envelope.documents ?? [];
    if (!docs.some((d) => d.id === args.document_id)) {
      throw new NotFoundException('document_not_found');
    }
    if (docs.length <= 1) throw new ConflictException('last_document');
    return {
      envelope_id: envelope.id,
      document_id: args.document_id,
      removes_fields: envelope.fields.filter((f) => f.document_id === args.document_id).length,
    };
  },
  handler: async (args, ctx) => {
    await ctx.services.documents.remove(ctx.principal.ownerId, args.envelope_id, args.document_id);
    return { removed: true as const };
  },
});
