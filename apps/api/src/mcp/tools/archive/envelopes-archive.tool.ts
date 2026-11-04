import { EnvelopesArchiveInputSchema, McpEnvelopeSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { WRITE_ANNOTATIONS, loadEnvelope, loadMcpEnvelope } from '../prepare/draft-helpers';

/**
 * `envelopes_archive` → `EnvelopesService.setArchived`,
 * as `POST /envelopes/:id/archive` (undo: `envelopes_unarchive`). Any status. Archiving
 * only files the envelope away from the owner's Documents tabs: no event
 * row, no mail, no status change, and it is undone by unarchiving, so
 * neither needs owner approval. `envelopes_search` filters with `archived`.
 */
export const envelopesArchiveTool = defineWriteTool({
  name: 'envelopes_archive',
  title: 'Archive an envelope',
  description:
    'Archives an envelope in any status: it moves out of the Documents tabs to Archived in the app. Nothing else changes: signers are not told, a sent envelope keeps going, and a sealed one stays verifiable. Undo with envelopes_unarchive. Use this, not envelopes_delete_draft or envelopes_cancel, to tidy up finished envelopes. Returns the envelope with archived_at. Requires idempotency_key and dry_run.',
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
      already_archived: envelope.archived_at != null,
    };
  },
  handler: async (args, ctx) => {
    await ctx.services.envelopes.setArchived(ctx.principal.ownerId, args.envelope_id, true);
    return loadMcpEnvelope(ctx, args.envelope_id);
  },
});
