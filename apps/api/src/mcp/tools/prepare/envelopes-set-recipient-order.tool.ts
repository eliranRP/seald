import { BadRequestException } from '@nestjs/common';
import { EnvelopesSetSigningOrderInputSchema, McpEnvelopeSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { toMcpEnvelope } from '../envelope-mappers';
import { WRITE_ANNOTATIONS, requireDraft } from './draft-helpers';

/**
 * `envelopes_set_recipient_order` → `SigningOrderService.setOrder`, as
 * `PUT /envelopes/:id/signing-order` (WP-05, flag `signingOrder`; step 8c).
 */
export const envelopesSetRecipientOrderTool = defineWriteTool({
  name: 'envelopes_set_recipient_order',
  title: 'Set the recipient order',
  description:
    'Sets how a draft goes out: delivery_mode parallel (everyone at once) or sequential (in steps). signers, when given, lists every signer of the draft once with a signing_order from 1; signers with the same number form one step. Requires idempotency_key and dry_run.',
  step: 'step-8c',
  scopes: ['envelopes:write'],
  annotations: WRITE_ANNOTATIONS,
  requiresFlags: ['signingOrder'],
  input: EnvelopesSetSigningOrderInputSchema,
  output: McpEnvelopeSchema,
  preview: async (args, ctx) => {
    const envelope = await requireDraft(ctx, args.envelope_id);
    if (args.signers !== undefined) {
      const known = new Set(envelope.signers.map((s) => s.id));
      const given = new Set(args.signers.map((s) => s.signer_id));
      if (
        given.size !== args.signers.length ||
        given.size !== known.size ||
        [...given].some((id) => !known.has(id))
      ) {
        throw new BadRequestException('signing_order_invalid');
      }
    }
    return {
      envelope_id: envelope.id,
      delivery_mode: args.delivery_mode,
      steps: new Set((args.signers ?? []).map((s) => s.signing_order)).size,
    };
  },
  handler: async (args, ctx) => {
    const envelope = await ctx.services.signingOrder.setOrder(
      ctx.principal.ownerId,
      args.envelope_id,
      {
        delivery_mode: args.delivery_mode,
        ...(args.signers !== undefined
          ? {
              signers: args.signers.map((s) => ({
                signer_id: s.signer_id,
                signing_order: s.signing_order,
              })),
            }
          : {}),
      },
    );
    return toMcpEnvelope(await ctx.services.documents.decorateEnvelope(envelope));
  },
});
