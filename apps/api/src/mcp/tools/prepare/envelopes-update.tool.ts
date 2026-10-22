import { EnvelopesUpdateInputSchema, McpEnvelopeSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import {
  WRITE_ANNOTATIONS,
  loadEnvelope,
  loadMcpEnvelope,
  metadataPatch,
  previewMetadata,
} from './draft-helpers';

/**
 * `envelopes_update` → `EnvelopesService.patchDraft`, as
 * `PATCH /envelopes/:id` (step 8c): title, expiry, tags, reminders and
 * their cadence, date format and timezone.
 */
export const envelopesUpdateTool = defineWriteTool({
  name: 'envelopes_update',
  title: 'Update a draft',
  description:
    'Changes an envelope: title and expires_at (drafts only), tags, reminders_enabled, the reminder cadence (reminder_first_after_days, reminder_interval_days, reminder_max) and how date fields render (date_format, timezone). Send only the keys to change. Returns the envelope. Requires idempotency_key and dry_run.',
  step: 'step-8c',
  scopes: ['envelopes:write'],
  annotations: WRITE_ANNOTATIONS,
  input: EnvelopesUpdateInputSchema,
  output: McpEnvelopeSchema,
  preview: async (args, ctx) => {
    const patch = metadataPatch(args, ctx.now);
    previewMetadata(patch);
    const envelope = await loadEnvelope(ctx, args.envelope_id);
    return { envelope_id: envelope.id, status: envelope.status, patch };
  },
  handler: async (args, ctx) => {
    await ctx.services.envelopes.patchDraft(
      ctx.principal.ownerId,
      args.envelope_id,
      metadataPatch(args, ctx.now),
    );
    return loadMcpEnvelope(ctx, args.envelope_id);
  },
});
