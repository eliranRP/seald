import { EnvelopesGetAccessAuthInputSchema, EnvelopesGetAccessAuthOutputSchema } from 'shared';
import { defineTool } from '../../tool';

/** `envelopes_get_access_auth` → `AccessAuthService.getSettings`, as `GET /envelopes/:id/access-auth`. */
export const envelopesGetAccessAuthTool = defineTool({
  name: 'envelopes_get_access_auth',
  title: 'Get signer access code settings',
  description:
    "Reads whether signers of an envelope must enter an emailed one-time code before opening the document (access_auth) and again right before submitting (action_auth): the envelope default, each signer's own override (null inherits) and what each signer will actually face. The only method besides none is email_otp: a code emailed to the signer, which proves control of the mailbox and nothing more.",
  step: 'step-15',
  scopes: ['envelopes:read'],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  requiresFlags: ['signerAccessAuth'],
  input: EnvelopesGetAccessAuthInputSchema,
  output: EnvelopesGetAccessAuthOutputSchema,
  handler: (args, ctx) =>
    ctx.services.accessAuth.getSettings(ctx.principal.ownerId, args.envelope_id),
});
