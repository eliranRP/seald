import { EnvelopeWriteInputSchema, EnvelopesDeleteDraftOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { DESTRUCTIVE_ANNOTATIONS, requireDraft } from './draft-helpers';

/** `envelopes_delete_draft` → `EnvelopesService.deleteDraft`, as `DELETE /envelopes/:id` (step 8c). */
export const envelopesDeleteDraftTool = defineWriteTool({
  name: 'envelopes_delete_draft',
  title: 'Delete a draft',
  description:
    'Deletes a draft envelope with its documents, signers and fields. Only drafts: an envelope that was sent is canceled in Seald, not deleted. Requires idempotency_key and dry_run.',
  step: 'step-8c',
  scopes: ['envelopes:write'],
  annotations: DESTRUCTIVE_ANNOTATIONS,
  input: EnvelopeWriteInputSchema,
  output: EnvelopesDeleteDraftOutputSchema,
  preview: async (args, ctx) => {
    const envelope = await requireDraft(ctx, args.envelope_id);
    return {
      envelope_id: envelope.id,
      deletes: {
        documents: envelope.documents?.length ?? 0,
        signers: envelope.signers.length,
        fields: envelope.fields.length,
      },
    };
  },
  handler: async (args, ctx) => {
    await ctx.services.envelopes.deleteDraft(ctx.principal.ownerId, args.envelope_id);
    return { deleted: true as const };
  },
});
