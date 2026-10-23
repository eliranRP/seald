import { EnvelopesCreateInputSchema, McpEnvelopeSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { WRITE_ANNOTATIONS, loadMcpEnvelope } from './draft-helpers';

/** `envelopes_create` → `EnvelopesService.createDraft`, as `POST /envelopes` (step 8c). */
export const envelopesCreateTool = defineWriteTool({
  name: 'envelopes_create',
  title: 'Create a draft',
  description:
    'Creates an empty draft envelope with this title and returns it. Nothing is sent. Add documents with envelopes_add_document or envelopes_upload_pdf, then signers and fields; or use envelopes_prepare to do it in one call. Requires idempotency_key and dry_run.',
  step: 'step-8c',
  scopes: ['envelopes:write'],
  annotations: WRITE_ANNOTATIONS,
  input: EnvelopesCreateInputSchema,
  output: McpEnvelopeSchema,
  preview: async (args) => ({ title: args.title, status: 'draft' }),
  handler: async (args, ctx) => {
    const created = await ctx.services.envelopes.createDraft(ctx.principal.ownerId, {
      title: args.title,
    });
    return loadMcpEnvelope(ctx, created.id);
  },
});
