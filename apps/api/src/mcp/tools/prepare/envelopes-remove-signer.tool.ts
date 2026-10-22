import { EnvelopesRemoveSignerInputSchema, McpRemovedOutputSchema } from 'shared';
import { NotFoundException } from '@nestjs/common';
import { defineWriteTool } from '../../tool';
import { DESTRUCTIVE_ANNOTATIONS, requireDraft } from './draft-helpers';

/**
 * `envelopes_remove_signer` → `EnvelopesService.removeSigner`, as
 * `DELETE /envelopes/:id/signers/:signer_id` (step 8c).
 */
export const envelopesRemoveSignerTool = defineWriteTool({
  name: 'envelopes_remove_signer',
  title: 'Remove a signer',
  description:
    "Removes a signer from a draft, with that signer's fields. Requires idempotency_key and dry_run.",
  step: 'step-8c',
  scopes: ['envelopes:write'],
  annotations: DESTRUCTIVE_ANNOTATIONS,
  input: EnvelopesRemoveSignerInputSchema,
  output: McpRemovedOutputSchema,
  preview: async (args, ctx) => {
    const envelope = await requireDraft(ctx, args.envelope_id);
    if (!envelope.signers.some((s) => s.id === args.signer_id)) {
      throw new NotFoundException('envelope_not_found');
    }
    return {
      envelope_id: envelope.id,
      signer_id: args.signer_id,
      removes_fields: envelope.fields.filter((f) => f.signer_id === args.signer_id).length,
    };
  },
  handler: async (args, ctx) => {
    await ctx.services.envelopes.removeSigner(
      ctx.principal.ownerId,
      args.envelope_id,
      args.signer_id,
    );
    return { removed: true as const };
  },
});
