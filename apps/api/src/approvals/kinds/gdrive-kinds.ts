import { ConflictException, NotFoundException } from '@nestjs/common';
import { uuid } from 'shared';
import { z } from 'zod';
import type { EnvelopesService } from '../../envelopes/envelopes.service';
import { mapGdriveSaveError } from '../../envelopes/gdrive-save-error.http-errors';
import type { GDriveService } from '../../integrations/gdrive/gdrive.service';
import type { ApprovalKindHandler, DescribedSubject } from './approval-kind';

export interface GdriveKindServices {
  readonly gdrive: GDriveService;
  readonly envelopes: EnvelopesService;
}

const DisconnectArgs = z.strictObject({ account_id: uuid });
type DisconnectArgs = z.infer<typeof DisconnectArgs>;

const SaveArgs = z.strictObject({
  envelope_id: uuid,
  folder_id: z.string().trim().min(1).max(256),
  folder_name: z.string().trim().min(1).max(255).optional(),
});
type SaveArgs = z.infer<typeof SaveArgs>;

/**
 * `gdrive_disconnect` (MCP step 14). The same `GDriveService.revokeAccount`
 * `DELETE /integrations/gdrive/accounts/:id` runs. High-risk: Approve
 * always needs a session.
 */
export function gdriveDisconnectKind(svc: GdriveKindServices): ApprovalKindHandler<DisconnectArgs> {
  return {
    kind: 'gdrive_disconnect',
    tool: 'gdrive_disconnect',
    actionLabel: 'Disconnect Google Drive',
    ready: true,
    args: DisconnectArgs,
    highRisk: () => true,
    async describe(args, ctx): Promise<DescribedSubject> {
      const accounts = await svc.gdrive.listAccounts(ctx.ownerId);
      const account = accounts.find((a) => a.id === args.account_id && a.deletedAt === null);
      if (!account) throw new NotFoundException('gdrive_account_not_found');
      return {
        subjectKey: `gdrive_account:${account.id}`,
        envelopeId: null,
        title: null,
        recipients: [],
        pageCount: null,
        destination: { kind: 'drive_account', label: account.googleEmail },
        files: [],
        fields: [],
      };
    },
    async execute(args, ctx) {
      await svc.gdrive.revokeAccount(args.account_id, ctx.ownerId);
      return { disconnected: true };
    },
  };
}

/**
 * `envelope_save_to_drive` (MCP step 14). Saves the sealed and audit PDFs
 * into a folder the app can already write. Every folder passed here is a
 * non-default folder, so Approve needs a session. The default folder
 * ("My Drive / Seald", created by the app when `folder_id` is omitted)
 * is step 14's (WP-25) to add; when it lands it is the one low-risk case.
 */
export function envelopeSaveToDriveKind(svc: GdriveKindServices): ApprovalKindHandler<SaveArgs> {
  return {
    kind: 'envelope_save_to_drive',
    tool: 'envelopes_save_to_drive',
    actionLabel: 'Save to Google Drive',
    ready: true,
    args: SaveArgs,
    highRisk: () => true,
    async describe(args, ctx): Promise<DescribedSubject> {
      const envelope = await svc.envelopes.getById(ctx.ownerId, args.envelope_id);
      if (envelope.status !== 'completed') throw new ConflictException('envelope_not_sealed');
      return {
        subjectKey: `envelope:${envelope.id}:drive:${args.folder_id}`,
        envelopeId: envelope.id,
        title: envelope.title,
        recipients: [],
        pageCount: envelope.original_pages,
        destination: { kind: 'drive_folder', label: args.folder_name ?? 'Selected folder' },
        files: envelope.sealed_sha256 ? [envelope.sealed_sha256] : [],
        fields: [],
        extra: { folder_id: args.folder_id },
      };
    },
    async execute(args, ctx) {
      try {
        const result = await svc.envelopes.saveToGoogleDrive(ctx.ownerId, args.envelope_id, {
          folderId: args.folder_id,
          folderName: args.folder_name ?? null,
        });
        return {
          folder_id: result.folder.id,
          file_ids: result.files.map((f) => f.fileId),
          ...(result.error ? { partial: true } : {}),
        };
      } catch (err) {
        throw mapGdriveSaveError(err);
      }
    },
  };
}
