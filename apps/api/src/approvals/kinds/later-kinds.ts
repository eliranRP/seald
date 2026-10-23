import { NotFoundException } from '@nestjs/common';
import { uuid } from 'shared';
import { z } from 'zod';
import type { ApprovalKindHandler, DescribedSubject } from './approval-kind';
import {
  audit,
  envelopeFacts,
  fieldsOf,
  refuseOwnerAsSigner,
  type EnvelopeKindServices,
} from './envelope-kinds';

/**
 * Approval kinds of the MCP "Later" list (WP-26, step 15) that act on one
 * envelope. The bulk kind lives next to its service
 * (`mcp/tools/later/bulk-send-kind.ts`) and plugs in through the registry.
 */

const FixSignerArgs = z
  .strictObject({
    envelope_id: uuid,
    signer_id: uuid,
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().toLowerCase().pipe(z.email().max(320)).optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined);
type FixSignerArgs = z.infer<typeof FixSignerArgs>;

const ChangeExpiryArgs = z.strictObject({
  envelope_id: uuid,
  expires_at: z.string().datetime({ offset: true }),
});
type ChangeExpiryArgs = z.infer<typeof ChangeExpiryArgs>;

/**
 * `envelope_fix_signer` (MCP step 15). Corrects the name or email of a
 * signer who has not signed, and re-invites them. Bound to the envelope as
 * it is now plus the signer's current name and address, so the owner
 * approves exactly this change. The card lists the corrected signer as the
 * recipient, so a new address is flagged New. High-risk: Approve always
 * needs a session. The address that stops being a recipient is told by
 * the service, and every earlier link stops working.
 */
export function envelopeFixSignerKind(
  svc: EnvelopeKindServices,
): ApprovalKindHandler<FixSignerArgs> {
  return {
    kind: 'envelope_fix_signer',
    tool: 'envelopes_fix_signer',
    actionLabel: 'Correct a signer and send a new link',
    ready: true,
    args: FixSignerArgs,
    highRisk: () => true,
    async describe(args, ctx): Promise<DescribedSubject> {
      const { signer } = await svc.envelopes.checkFixSigner(
        ctx.ownerId,
        args.envelope_id,
        args.signer_id,
        args,
      );
      const { envelope, files, pageCount } = await envelopeFacts(
        svc,
        ctx.ownerId,
        args.envelope_id,
      );
      const next = {
        name: args.name ?? signer.name,
        email: args.email ?? signer.email,
      };
      refuseOwnerAsSigner([next], ctx);
      return {
        subjectKey: `envelope:${envelope.id}:signer:${signer.id}`,
        envelopeId: envelope.id,
        title: envelope.title,
        recipients: [next],
        pageCount,
        destination: null,
        files,
        fields: fieldsOf(envelope),
        extra: {
          signer_id: signer.id,
          previous_name: signer.name,
          previous_email: signer.email.toLowerCase(),
          new_name: next.name,
          new_email: next.email.toLowerCase(),
        },
      };
    },
    async execute(args, ctx) {
      const fixed = await svc.envelopes.fixSigner(
        ctx.ownerId,
        args.envelope_id,
        args.signer_id,
        { name: args.name, email: args.email },
        audit(ctx),
        ctx.mcp ? { mcp: ctx.mcp } : undefined,
        ctx.now,
      );
      return { signer_id: fixed.signer.id, email_changed: fixed.email_changed };
    },
  };
}

/**
 * `envelope_change_expiry` (MCP step 15). A new `expires_at` on a sent
 * envelope. High-risk: Approve always needs a session ("Sign in to
 * approve"). Bound to the current and the new time.
 */
export function envelopeChangeExpiryKind(
  svc: EnvelopeKindServices,
): ApprovalKindHandler<ChangeExpiryArgs> {
  return {
    kind: 'envelope_change_expiry',
    tool: 'envelopes_change_expiry',
    actionLabel: 'Change when the request expires',
    ready: true,
    args: ChangeExpiryArgs,
    highRisk: () => true,
    async describe(args, ctx): Promise<DescribedSubject> {
      const envelope = await svc.envelopes.checkChangeExpiry(
        ctx.ownerId,
        args.envelope_id,
        args.expires_at,
        ctx.now,
      );
      const facts = await envelopeFacts(svc, ctx.ownerId, args.envelope_id);
      if (facts.envelope.id !== envelope.id) throw new NotFoundException('envelope_not_found');
      return {
        subjectKey: `envelope:${envelope.id}:expiry`,
        envelopeId: envelope.id,
        title: envelope.title,
        recipients: envelope.signers.map((s) => ({ name: s.name, email: s.email })),
        pageCount: facts.pageCount,
        destination: null,
        files: facts.files,
        fields: fieldsOf(envelope),
        extra: {
          previous_expires_at: new Date(envelope.expires_at).toISOString(),
          expires_at: new Date(args.expires_at).toISOString(),
        },
      };
    },
    async execute(args, ctx) {
      const changed = await svc.envelopes.changeExpiry(
        ctx.ownerId,
        args.envelope_id,
        args.expires_at,
        audit(ctx),
        ctx.mcp ? { mcp: ctx.mcp } : undefined,
        ctx.now,
      );
      return { expires_at: changed.expires_at };
    },
  };
}
