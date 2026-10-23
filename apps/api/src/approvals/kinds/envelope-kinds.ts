import { ConflictException, NotFoundException } from '@nestjs/common';
import { isFeatureEnabled, uuid, type Envelope } from 'shared';
import { z } from 'zod';
import type { EnvelopeDocumentsService } from '../../envelopes/documents/envelope-documents.service';
import type { EnvelopesService } from '../../envelopes/envelopes.service';
import { sameMailbox } from '../../email/insert-idempotent';
import type { AccessAuthService } from '../../signing/access-auth/access-auth.service';
import type { SendGuardService } from '../send-guard.service';
import type { SubjectField } from '../subject-hash';
import type {
  ApprovalExecuteContext,
  ApprovalKindContext,
  ApprovalKindHandler,
  DescribedSubject,
} from './approval-kind';

/** The envelope services the envelope kinds act through (the same ones the controllers call). */
export interface EnvelopeKindServices {
  readonly envelopes: EnvelopesService;
  readonly documents: EnvelopeDocumentsService;
  /** WP-24: per-owner daily caps. */
  readonly guard: SendGuardService;
  /** WP-24: who must enter an emailed code (WP-10), bound into the send subject. */
  readonly accessAuth: AccessAuthService;
}

const EnvelopeArgs = z.strictObject({ envelope_id: uuid });
type EnvelopeArgs = z.infer<typeof EnvelopeArgs>;

const RemindArgs = z.strictObject({ envelope_id: uuid, signer_id: uuid });
type RemindArgs = z.infer<typeof RemindArgs>;

function fieldsOf(envelope: Envelope): SubjectField[] {
  return envelope.fields.map((f) => ({
    id: f.id,
    signer_id: f.signer_id,
    document_id: f.document_id ?? null,
    kind: f.kind,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width ?? null,
    height: f.height ?? null,
  }));
}

/**
 * The envelope facts every envelope kind binds: the file hash of each
 * document, the page count, and the field placement. A PDF swap or a
 * field move changes `subject_hash`.
 */
async function envelopeFacts(
  svc: EnvelopeKindServices,
  ownerId: string,
  envelopeId: string,
): Promise<{ envelope: Envelope; files: string[]; pageCount: number | null }> {
  const envelope = await svc.envelopes.getById(ownerId, envelopeId);
  const docs = await svc.documents.list(ownerId, envelopeId);
  if (docs.length > 0) {
    const pages = docs.reduce((sum, d) => sum + (d.original_pages ?? 0), 0);
    return {
      envelope,
      files: docs.map((d) => d.original_sha256 ?? ''),
      pageCount: pages > 0 ? pages : null,
    };
  }
  return {
    envelope,
    files: envelope.original_sha256 ? [envelope.original_sha256] : [],
    pageCount: envelope.original_pages,
  };
}

/** An MCP send or remind never goes to the account's own mailbox: send that from Seald. */
function refuseOwnerAsSigner(
  signers: ReadonlyArray<{ readonly email: string }>,
  ctx: ApprovalKindContext,
): void {
  if (signers.some((s) => sameMailbox(s.email, ctx.ownerEmail))) {
    throw new ConflictException('signer_is_account_owner');
  }
}

function audit(ctx: ApprovalExecuteContext): { ip: string | null; user_agent: string | null } {
  return { ip: ctx.audit.ip, user_agent: ctx.audit.user_agent };
}

/**
 * Send facts beyond recipients, files and fields that change what the
 * signers get (hashed into `subject_hash`): the delivery order in force
 * (WP-05/06) and each signer's emailed-code requirement (WP-10). The
 * owner approves exactly who is invited first and who must enter a code;
 * changing either after the request expires the approval.
 */
async function sendFacts(
  svc: EnvelopeKindServices,
  envelope: Envelope,
): Promise<Record<string, unknown>> {
  const signers = [...envelope.signers].sort((a, b) => a.id.localeCompare(b.id));
  const access = [];
  for (const s of signers) {
    const eff = await svc.accessAuth.effectiveFor(envelope.id, s.id);
    access.push({ signer_id: s.id, access: eff.access, action: eff.action });
  }
  return {
    delivery_mode: isFeatureEnabled('signingOrder') ? envelope.delivery_mode : 'parallel',
    signing_order: signers.map((s) => ({ signer_id: s.id, signing_order: s.signing_order })),
    access_auth: access,
  };
}

/**
 * `envelope_send` (MCP step 10). Bound to the draft as it is now: every
 * recipient, the files, the fields, the delivery order and the access
 * codes. Approve runs the same `EnvelopesService.send` the SPA route
 * runs, from the account mailbox, so sequential order only invites the
 * first step and access codes apply at `/sign/start` as for any send.
 *
 * The per-owner daily caps (20 sends, 25 new recipients) are checked at
 * request and decision time, and again under `pg_advisory_xact_lock` in
 * `execute`, inside the decision's transaction. Every event the send
 * writes carries `metadata.mcp`.
 */
export function envelopeSendKind(svc: EnvelopeKindServices): ApprovalKindHandler<EnvelopeArgs> {
  return {
    kind: 'envelope_send',
    tool: 'envelopes_send',
    actionLabel: 'Send for signature',
    ready: true,
    args: EnvelopeArgs,
    highRisk: () => false,
    async describe(args, ctx): Promise<DescribedSubject> {
      const { envelope, files, pageCount } = await envelopeFacts(
        svc,
        ctx.ownerId,
        args.envelope_id,
      );
      if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');
      refuseOwnerAsSigner(envelope.signers, ctx);
      return {
        subjectKey: `envelope:${envelope.id}`,
        envelopeId: envelope.id,
        title: envelope.title,
        recipients: envelope.signers.map((s) => ({ name: s.name, email: s.email })),
        pageCount,
        destination: null,
        files,
        fields: fieldsOf(envelope),
        extra: await sendFacts(svc, envelope),
      };
    },
    async checkLimits(_args, ctx) {
      await svc.guard.assertCaps(ctx.ownerId, ctx.newRecipients, ctx.now);
    },
    async execute(args, ctx) {
      // Under the owner lock, inside the decision's transaction: two
      // approvals racing at the cap give one send and one Failed.
      const newRecipientEmails = ctx.newRecipientEmails ?? new Set<string>();
      await svc.guard.assertCapsLocked(ctx.ownerId, newRecipientEmails.size, ctx.now);
      const sent = await svc.envelopes.send(
        ctx.ownerId,
        args.envelope_id,
        { email: ctx.ownerEmail, name: null },
        audit(ctx),
        ctx.mcp ? { mcp: ctx.mcp, newRecipientEmails } : undefined,
      );
      return { status: sent.status, envelope_id: sent.id };
    },
  };
}

/** `envelope_remind` (MCP step 11). One signer of a sent envelope. */
export function envelopeRemindKind(svc: EnvelopeKindServices): ApprovalKindHandler<RemindArgs> {
  return {
    kind: 'envelope_remind',
    tool: 'envelopes_remind',
    actionLabel: 'Send a reminder',
    ready: true,
    args: RemindArgs,
    highRisk: () => false,
    async describe(args, ctx): Promise<DescribedSubject> {
      const { envelope, files, pageCount } = await envelopeFacts(
        svc,
        ctx.ownerId,
        args.envelope_id,
      );
      if (envelope.status !== 'awaiting_others') throw new ConflictException('envelope_terminal');
      const signer = envelope.signers.find((s) => s.id === args.signer_id);
      if (!signer) throw new NotFoundException('signer_not_found');
      if (signer.signed_at !== null) throw new ConflictException('already_signed');
      if (signer.declined_at !== null) throw new ConflictException('signer_declined');
      refuseOwnerAsSigner([signer], ctx);
      return {
        subjectKey: `envelope:${envelope.id}:signer:${signer.id}`,
        envelopeId: envelope.id,
        title: envelope.title,
        recipients: [{ name: signer.name, email: signer.email }],
        pageCount,
        destination: null,
        files,
        fields: fieldsOf(envelope),
      };
    },
    async execute(args, ctx) {
      // The hourly throttle and the signing-order turn are re-checked
      // here; a failure records Failed with its slug and sends nothing.
      await svc.envelopes.remindSigner(
        ctx.ownerId,
        args.envelope_id,
        args.signer_id,
        { email: ctx.ownerEmail, name: null },
        ctx.mcp ? { mcp: ctx.mcp } : undefined,
      );
      return { status: 'queued' };
    },
  };
}

/**
 * `envelope_cancel` (MCP step 11). Withdrawal mail goes to every signer
 * still relevant. High-risk: Approve always needs a session.
 */
export function envelopeCancelKind(svc: EnvelopeKindServices): ApprovalKindHandler<EnvelopeArgs> {
  return {
    kind: 'envelope_cancel',
    tool: 'envelopes_cancel',
    actionLabel: 'Cancel the request',
    ready: true,
    args: EnvelopeArgs,
    highRisk: () => true,
    async describe(args, ctx): Promise<DescribedSubject> {
      const { envelope, files, pageCount } = await envelopeFacts(
        svc,
        ctx.ownerId,
        args.envelope_id,
      );
      if (envelope.status !== 'awaiting_others' && envelope.status !== 'sealing') {
        throw new ConflictException('envelope_terminal');
      }
      return {
        subjectKey: `envelope:${envelope.id}`,
        envelopeId: envelope.id,
        title: envelope.title,
        recipients: envelope.signers.map((s) => ({ name: s.name, email: s.email })),
        pageCount,
        destination: null,
        files,
        fields: fieldsOf(envelope),
      };
    },
    async execute(args, ctx) {
      const result = await svc.envelopes.cancel(
        ctx.ownerId,
        args.envelope_id,
        audit(ctx),
        ctx.mcp ? { mcp: ctx.mcp } : undefined,
      );
      return { status: result.status };
    },
  };
}
