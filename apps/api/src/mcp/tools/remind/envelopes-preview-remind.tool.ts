import { EnvelopesPreviewRemindInputSchema, EnvelopesPreviewRemindOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { credentialOf } from '../send/send-helpers';

/**
 * `envelopes_preview_remind` (MCP step 11): who a reminder would go to,
 * after every check `envelopes_remind` runs. Writes nothing and returns
 * no confirmation token: a reminder always goes through owner approval.
 */
export const envelopesPreviewRemindTool = defineWriteTool({
  name: 'envelopes_preview_remind',
  title: 'Preview a reminder',
  description:
    'Returns the name and email of the signer a reminder would go to, after the same checks envelopes_remind runs (out for signature, not signed or declined, their turn, not reminded in the last hour). Nothing is sent and no approval is opened; call envelopes_remind to ask the owner. Requires idempotency_key and dry_run.',
  step: 'step-11',
  scopes: ['envelopes:send'],
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  atomic: true,
  input: EnvelopesPreviewRemindInputSchema,
  output: EnvelopesPreviewRemindOutputSchema,
  preview: (args, ctx) =>
    ctx.services.envelopeActions.previewRemind(
      credentialOf(ctx),
      args.envelope_id,
      args.signer_id,
      ctx.now,
    ),
  handler: (args, ctx) =>
    ctx.services.envelopeActions.previewRemind(
      credentialOf(ctx),
      args.envelope_id,
      args.signer_id,
      ctx.now,
    ),
});
