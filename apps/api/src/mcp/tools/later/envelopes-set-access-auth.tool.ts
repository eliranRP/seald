import { BadRequestException, ConflictException } from '@nestjs/common';
import { EnvelopesSetAccessAuthInputSchema, EnvelopesSetAccessAuthOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';

/** `envelopes_set_access_auth` → `AccessAuthService.patchSettings`, as `PATCH /envelopes/:id/access-auth`. */
export const envelopesSetAccessAuthTool = defineWriteTool({
  name: 'envelopes_set_access_auth',
  title: 'Set signer access code settings',
  description:
    'Requires (email_otp) or removes (none) the emailed one-time code for signers of a draft envelope: access_auth gates opening the document, action_auth re-checks right before submit. Set the envelope default, and optionally per signer in signers (null inherits the default). Drafts only; the settings are part of what the owner approves when the envelope is sent. Requires idempotency_key and dry_run.',
  step: 'step-15',
  scopes: ['envelopes:write'],
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  requiresFlags: ['signerAccessAuth'],
  atomic: true,
  input: EnvelopesSetAccessAuthInputSchema,
  output: EnvelopesSetAccessAuthOutputSchema,
  preview: async (args, ctx) => {
    const envelope = await ctx.services.envelopes.getById(ctx.principal.ownerId, args.envelope_id);
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');
    const known = new Set(envelope.signers.map((s) => s.id));
    const seen = new Set<string>();
    for (const s of args.signers ?? []) {
      if (!known.has(s.signer_id) || seen.has(s.signer_id)) {
        throw new BadRequestException('validation_error');
      }
      seen.add(s.signer_id);
    }
    return {
      envelope_id: args.envelope_id,
      ...(args.access_auth !== undefined ? { access_auth: args.access_auth } : {}),
      ...(args.action_auth !== undefined ? { action_auth: args.action_auth } : {}),
      signers: (args.signers ?? []).length,
    };
  },
  handler: (args, ctx) =>
    ctx.services.accessAuth.patchSettings(ctx.principal.ownerId, args.envelope_id, {
      ...(args.access_auth !== undefined ? { access_auth: args.access_auth } : {}),
      ...(args.action_auth !== undefined ? { action_auth: args.action_auth } : {}),
      ...(args.signers !== undefined
        ? {
            signers: args.signers.map((s) => ({
              signer_id: s.signer_id,
              ...(s.access_auth !== undefined ? { access_auth: s.access_auth } : {}),
              ...(s.action_auth !== undefined ? { action_auth: s.action_auth } : {}),
            })),
          }
        : {}),
    }),
});
