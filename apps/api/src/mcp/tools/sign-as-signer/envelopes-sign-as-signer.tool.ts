import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  EnvelopesSignAsSignerInputSchema,
  EnvelopesSignAsSignerOutputSchema,
  type EnvelopesSignAsSignerInput,
} from 'shared';
import { previewApproval, requestApproval } from '../../approval-pending';
import { defineWriteTool, type McpToolContext } from '../../tool';
import { GATED_ANNOTATIONS, GATED_GUIDANCE } from '../account/gated-helpers';

/**
 * The signer row the owner would sign as: `signer_id` when given (the
 * approval kind refuses one whose address is not the account email),
 * else the one signer that carries the account email.
 */
async function signerArgs(
  args: EnvelopesSignAsSignerInput,
  ctx: McpToolContext,
): Promise<{ envelope_id: string; signer_id: string }> {
  const { ownerId } = ctx.principal;
  const envelope = await ctx.services.envelopes.getById(ownerId, args.envelope_id);
  if (args.signer_id !== undefined) {
    return { envelope_id: envelope.id, signer_id: args.signer_id };
  }
  const email = (await ctx.services.accounts.email(ownerId))?.trim().toLowerCase() ?? '';
  const mine = envelope.signers.filter((s) => s.email.trim().toLowerCase() === email);
  const only = mine[0];
  if (!only || email === '') throw new ConflictException('owner_not_a_signer');
  if (mine.length > 1) throw new BadRequestException('signer_id_required');
  return { envelope_id: envelope.id, signer_id: only.id };
}

/**
 * `envelopes_sign_as_signer` (WP-45, D5). For an envelope where the
 * account owner is a signer, asks the owner to sign as that signer. The
 * agent never signs: the approval page is the signer's own consent (the
 * ESIGN disclosure, the intent-to-sign sentence and the fields), the
 * owner adopts their signature there, and only Approve applies it. It
 * never applies to another signer.
 *
 * The tool name names the signer row it acts for; the act is the
 * owner's, on the page (see the catalog contract's naming rule).
 */
export const envelopesSignAsSignerTool = defineWriteTool({
  name: 'envelopes_sign_as_signer',
  title: 'Ask the owner to sign as themselves',
  description: `For an envelope that is out for signature and lists the account owner's own email as a signer, asks the owner to sign it. The agent does not sign and never passes a signature: the owner reviews the fields, reads the electronic-signature disclosure, confirms intent and adopts a signature on the approval page. It never applies to any other signer (signer_not_account_owner). Fields that need the signer's own answer, or an emailed access code, make it fail; the owner then signs from their link. ${GATED_GUIDANCE} Needs envelopes:sign. Requires idempotency_key and dry_run.`,
  step: 'WP-45',
  scopes: ['envelopes:sign'],
  annotations: GATED_ANNOTATIONS,
  atomic: true,
  input: EnvelopesSignAsSignerInputSchema,
  output: EnvelopesSignAsSignerOutputSchema,
  preview: async (args, ctx) =>
    previewApproval(ctx, 'envelope_sign_as_signer', await signerArgs(args, ctx)),
  handler: async (args, ctx) =>
    requestApproval(
      ctx,
      'envelope_sign_as_signer',
      'envelopes_sign_as_signer',
      await signerArgs(args, ctx),
    ),
});
