import { EnvelopesRemindInputSchema, EnvelopesRemindOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { APPROVAL_GUIDANCE, SEND_ANNOTATIONS, credentialOf } from '../send/send-helpers';

/**
 * `envelopes_remind` (MCP step 11) → `EnvelopesService.remindSigner`,
 * only after the owner approves. Always the approval path; no
 * confirmation token. The hourly guard stays (`remind_throttled`), and a
 * later step of a sequential envelope is `not_your_turn`; both are
 * checked before the approval is opened and again on Approve.
 */
export const envelopesRemindTool = defineWriteTool({
  name: 'envelopes_remind',
  title: 'Remind a signer (owner approves)',
  description: `Asks the account owner to email a signer a reminder with a fresh signing link. Returns approval_pending with review_url; nothing is sent until the owner approves. ${APPROVAL_GUIDANCE} A signer reminded less than an hour ago fails with remind_throttled and retry_after_seconds; in sequential order only the signers whose turn it is can be reminded (not_your_turn). Requires idempotency_key and dry_run.`,
  step: 'step-11',
  scopes: ['envelopes:send'],
  annotations: SEND_ANNOTATIONS,
  atomic: true,
  input: EnvelopesRemindInputSchema,
  output: EnvelopesRemindOutputSchema,
  preview: (args, ctx) =>
    ctx.services.envelopeActions.previewRemind(
      credentialOf(ctx),
      args.envelope_id,
      args.signer_id,
      ctx.now,
    ),
  handler: (args, ctx) =>
    ctx.services.envelopeActions.remind(
      credentialOf(ctx),
      args.envelope_id,
      args.signer_id,
      ctx.now,
    ),
});
