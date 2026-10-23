import { EnvelopesChangeExpiryInputSchema, EnvelopesChangeExpiryOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { APPROVAL_GUIDANCE, SEND_ANNOTATIONS, credentialOf } from '../send/send-helpers';

/**
 * `envelopes_change_expiry` (MCP step 15) → `EnvelopesService.changeExpiry`,
 * only after the owner approves with a sign-in. A draft's expiry is set
 * with `envelopes_update` instead.
 */
export const envelopesChangeExpiryTool = defineWriteTool({
  name: 'envelopes_change_expiry',
  title: 'Change the expiry of a sent envelope (owner approves)',
  description: `Asks the account owner to move the expiry of an envelope that is out for signature. expires_at is an ISO 8601 time at least a day from now and at most 90 days out (UTC). Returns approval_pending with review_url and approve_requires session: the owner must sign in to approve ("Sign in to approve"). ${APPROVAL_GUIDANCE} A draft keeps using envelopes_update; a finished envelope fails with envelope_terminal. Requires idempotency_key and dry_run.`,
  step: 'step-15',
  scopes: ['envelopes:send'],
  annotations: SEND_ANNOTATIONS,
  atomic: true,
  input: EnvelopesChangeExpiryInputSchema,
  output: EnvelopesChangeExpiryOutputSchema,
  preview: (args, ctx) =>
    ctx.services.envelopeActions.checkChangeExpiry(
      credentialOf(ctx),
      args.envelope_id,
      args.expires_at,
      ctx.now,
    ),
  handler: (args, ctx) =>
    ctx.services.envelopeActions.changeExpiry(
      credentialOf(ctx),
      args.envelope_id,
      args.expires_at,
      ctx.now,
    ),
});
