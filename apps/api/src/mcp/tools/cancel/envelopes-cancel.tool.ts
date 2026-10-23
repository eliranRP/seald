import { EnvelopesCancelInputSchema, EnvelopesCancelOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { APPROVAL_GUIDANCE, SEND_ANNOTATIONS, credentialOf } from '../send/send-helpers';

/**
 * `envelopes_cancel` (MCP step 11) → `EnvelopesService.cancel`, only
 * after the owner approves with a sign-in (cancel is high-risk, so
 * `approve_requires` is always `session`). Withdrawal mail goes to the
 * signers on Approve. No confirmation token.
 */
export const envelopesCancelTool = defineWriteTool({
  name: 'envelopes_cancel',
  title: 'Cancel a sent envelope (owner approves)',
  description: `Asks the account owner to cancel (withdraw) an envelope that is out for signature; on Approve, Seald emails the signers that it was withdrawn. Returns approval_pending with review_url and approve_requires session: the owner must sign in to approve. ${APPROVAL_GUIDANCE} A draft is deleted with envelopes_delete_draft instead; a completed, declined, expired or canceled envelope fails with envelope_terminal. Requires idempotency_key and dry_run.`,
  step: 'step-11',
  scopes: ['envelopes:send'],
  annotations: { ...SEND_ANNOTATIONS, destructiveHint: true },
  atomic: true,
  input: EnvelopesCancelInputSchema,
  output: EnvelopesCancelOutputSchema,
  preview: (args, ctx) =>
    ctx.services.envelopeActions.checkCancel(credentialOf(ctx), args.envelope_id, ctx.now),
  handler: (args, ctx) =>
    ctx.services.envelopeActions.cancel(credentialOf(ctx), args.envelope_id, ctx.now),
});
