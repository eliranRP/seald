import { EnvelopesSendInputSchema, EnvelopesSendOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { APPROVAL_GUIDANCE, SEND_ANNOTATIONS, credentialOf } from './send-helpers';

/**
 * `envelopes_send` (MCP step 10) → `EnvelopesService.send`, only after
 * the owner approves. By default it returns `approval_pending` with
 * `review_url` and sends nothing; Seald sends on the owner's Approve.
 * Only when the key's owner turned approval off does the same-turn
 * send run, with the confirmation token from `envelopes_preview_send`;
 * a recipient the key has not reached before still goes to approval.
 *
 * Atomic: the idempotency claim, the approval row or the send, and the
 * stored response commit in one transaction, so a retry after a crash
 * can never send twice.
 */
export const envelopesSendTool = defineWriteTool({
  name: 'envelopes_send',
  title: 'Send for signature (owner approves)',
  description: `Asks the account owner to send a draft envelope for signature. Returns approval_pending with review_url; nothing is sent until the owner approves, and Seald then sends it. ${APPROVAL_GUIDANCE} Only when the owner turned approval off for this key: call envelopes_preview_send first and pass its confirmation_token here in the same turn; a recipient this key has not emailed before still needs the owner's approval. An account email among the signers fails with signer_is_account_owner. Daily limits per account: 20 sends and 25 new recipients. Requires idempotency_key and dry_run.`,
  step: 'step-10',
  scopes: ['envelopes:send'],
  annotations: SEND_ANNOTATIONS,
  atomic: true,
  input: EnvelopesSendInputSchema,
  output: EnvelopesSendOutputSchema,
  preview: (args, ctx) =>
    ctx.services.envelopeActions.checkSend(credentialOf(ctx), args.envelope_id, ctx.now),
  handler: (args, ctx) =>
    ctx.services.envelopeActions.send(
      credentialOf(ctx),
      args.envelope_id,
      args.confirmation_token,
      ctx.now,
    ),
});
