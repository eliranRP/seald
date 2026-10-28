import { EnvelopesArchiveInputSchema, McpEnvelopeSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { WRITE_ANNOTATIONS, loadEnvelope, loadMcpEnvelope } from '../prepare/draft-helpers';

/** `envelopes_unarchive` → `EnvelopesService.setArchived`, as `POST /envelopes/:id/unarchive`. */
export const envelopesUnarchiveTool = defineWriteTool({
  name: 'envelopes_unarchive',
  title: 'Unarchive an envelope',
  description:
    'Moves an archived envelope back to the Documents tabs in the app. Nothing else changes. Returns the envelope with archived_at null. Requires idempotency_key and dry_run.',
  step: 'step-17',
  scopes: ['envelopes:write'],
  annotations: WRITE_ANNOTATIONS,
  input: EnvelopesArchiveInputSchema,
  output: McpEnvelopeSchema,
  preview: async (args, ctx) => {
    const envelope = await loadEnvelope(ctx, args.envelope_id);
    return {
      envelope_id: envelope.id,
      status: envelope.status,
      archived: envelope.archived_at != null,
    };
  },
  handler: async (args, ctx) => {
    await ctx.services.envelopes.setArchived(ctx.principal.ownerId, args.envelope_id, false);
    return loadMcpEnvelope(ctx, args.envelope_id);
  },
});
