import { ConflictException, NotFoundException } from '@nestjs/common';
import { uuid, type Envelope } from 'shared';
import { z } from 'zod';
import type { EnvelopeDocumentsService } from '../../envelopes/documents/envelope-documents.service';
import type { EnvelopesService } from '../../envelopes/envelopes.service';
import { sameMailbox } from '../../email/insert-idempotent';
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
 * `envelope_send` (MCP step 10). Bound to the draft as it is now: every
 * recipient, the files and the fields. Approve runs the same
 * `EnvelopesService.send` the SPA route runs, from the account mailbox.
 *
 * TODO(WP-24): the per-owner daily caps (20 sends, 25 new recipients)
 * under `pg_advisory_xact_lock`, and `metadata.mcp` on the events, are
 * the send tool's work and land with it.
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
      };
    },
    async execute(args, ctx) {
      const sent = await svc.envelopes.send(
        ctx.ownerId,
        args.envelope_id,
        { email: ctx.ownerEmail, name: null },
        audit(ctx),
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
      await svc.envelopes.remindSigner(ctx.ownerId, args.envelope_id, args.signer_id, {
        email: ctx.ownerEmail,
        name: null,
      });
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
      const result = await svc.envelopes.cancel(ctx.ownerId, args.envelope_id, audit(ctx));
      return { status: result.status };
    },
  };
}
