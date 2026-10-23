import { EnvelopesPreviewSendInputSchema, EnvelopesPreviewSendOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { credentialOf } from './send-helpers';

/**
 * `envelopes_preview_send` (MCP step 10): the checks at the start of
 * `EnvelopesService.send`, without sending. On the approval path (the
 * default) it opens the owner approval and returns `review_url` but no
 * token. On the unattended path it mints the 10-minute confirmation
 * token `envelopes_send` needs in the same turn; that token is not kept
 * for an idempotent replay.
 */
export const envelopesPreviewSendTool = defineWriteTool({
  name: 'envelopes_preview_send',
  title: 'Preview a send',
  description:
    'Checks that a draft is ready to send (a file, at least one signer, one field, and a required signature or initials field for every signer) and returns the summary to show the user: title, signers, field count, expiry and file hash. Nothing is sent. When the owner approves sends (approval is email), it opens the approval and returns review_url: show it to the user and never open it. Only when the owner turned approval off for this key does it return a confirmation_token, valid 10 minutes, for envelopes_send in the same turn. When the account email is a signer, ready is false and signer_is_account_owner is true: the owner sends that one from Seald. Requires idempotency_key and dry_run.',
  step: 'step-10',
  scopes: ['envelopes:send'],
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  atomic: true,
  replayOmit: ['confirmation_token', 'expires_in_seconds'],
  input: EnvelopesPreviewSendInputSchema,
  output: EnvelopesPreviewSendOutputSchema,
  preview: (args, ctx) =>
    ctx.services.envelopeActions.checkSend(credentialOf(ctx), args.envelope_id, ctx.now),
  handler: (args, ctx) =>
    ctx.services.envelopeActions.previewSend(credentialOf(ctx), args.envelope_id, ctx.now),
});
