import { ConflictException } from '@nestjs/common';
import { ApprovalPendingResultSchema, EnvelopesSaveToDriveInputSchema } from 'shared';
import { requestApproval } from '../../approval-pending';
import { defineWriteTool } from '../../tool';
import { DRIVE_FILE_SCOPE_NOTE } from '../gdrive/gdrive-annotations';

/**
 * `envelopes_save_to_drive` (step 14): the sealed and audit PDFs of a
 * completed envelope into a Drive folder, only after the owner approves.
 * Scope stays `drive.file`: the folder is one the owner picked in Seald or
 * one Seald created. Every call returns `approval_pending`; nothing is
 * uploaded by the agent's say-so.
 */
export const envelopesSaveToDriveTool = defineWriteTool({
  name: 'envelopes_save_to_drive',
  title: 'Save a sealed envelope to Drive',
  description: `Asks the owner to save a completed envelope's sealed PDF and audit trail into a Google Drive folder (folder_id, with an optional folder_name for the approval card). Nothing is uploaded until the owner approves: the result is approval_pending with an approval_id and a review_url. Show review_url to the user and never open it. approve_requires is session: the owner must sign in to approve. Then poll approvals_get. The envelope must be completed (otherwise envelope_not_sealed). ${DRIVE_FILE_SCOPE_NOTE} Requires idempotency_key and dry_run.`,
  step: 'step-14',
  scopes: ['gdrive:write'],
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  requiresFlags: ['gdriveIntegration'],
  input: EnvelopesSaveToDriveInputSchema,
  output: ApprovalPendingResultSchema,
  preview: async (args, ctx) => {
    const envelope = await ctx.services.envelopes.getById(ctx.principal.ownerId, args.envelope_id);
    if (envelope.status !== 'completed') throw new ConflictException('envelope_not_sealed');
    return {
      envelope_id: envelope.id,
      folder_id: args.folder_id,
      files: ['sealed PDF', 'audit trail PDF'],
      requires: 'owner_approval',
      uploads: false,
    };
  },
  handler: async (args, ctx) =>
    requestApproval(ctx, 'envelope_save_to_drive', 'envelopes_save_to_drive', {
      envelope_id: args.envelope_id,
      folder_id: args.folder_id,
      ...(args.folder_name !== undefined ? { folder_name: args.folder_name } : {}),
    }),
});
