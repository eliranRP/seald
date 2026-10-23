import { GdriveImportInputSchema, GdriveImportOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { DRIVE_WRITE_ANNOTATIONS } from './gdrive-annotations';

/**
 * `gdrive_import` → `DriveImportService` through `DriveSourceService`
 * (step 8d). The only Drive import tool. Covers
 * `POST /integrations/gdrive/conversion` and, for agents, the Picker
 * credentials route: an agent cannot open Google's picker, so a file the
 * app cannot read answers `gdrive_file_not_picked` with a Seald page
 * where the owner picks it.
 */
export const gdriveImportTool = defineWriteTool({
  name: 'gdrive_import',
  title: 'Import a Drive file',
  description:
    'Imports one Google Drive file (file_id from gdrive_list_files or gdrive_search_files, or a share_url) as a staged PDF and returns its document_id. A Google Doc or .docx is converted. If conversion takes more than 25 seconds the result is conversion_pending with a job_id: poll gdrive_conversion_status. If Seald cannot read the file the error is gdrive_file_not_picked with a url where the owner picks it; if Drive is not connected, gdrive_not_connected with a url to connect it. Show those urls to the owner. Needs gdrive:read and documents:write. Requires idempotency_key and dry_run.',
  step: 'step-8d',
  scopes: ['gdrive:read', 'documents:write'],
  annotations: DRIVE_WRITE_ANNOTATIONS,
  requiresFlags: ['gdriveIntegration'],
  input: GdriveImportInputSchema,
  output: GdriveImportOutputSchema,
  preview: async (args, ctx) =>
    ctx.services.drive.previewImport(ctx.principal.ownerId, {
      ...(args.file_id !== undefined ? { file_id: args.file_id } : {}),
      ...(args.share_url !== undefined ? { share_url: args.share_url } : {}),
      ...(args.account_id !== undefined ? { account_id: args.account_id } : {}),
    }),
  handler: async (args, ctx) =>
    ctx.services.drive.importFile(
      ctx.principal.ownerId,
      {
        ...(args.file_id !== undefined ? { file_id: args.file_id } : {}),
        ...(args.share_url !== undefined ? { share_url: args.share_url } : {}),
        ...(args.account_id !== undefined ? { account_id: args.account_id } : {}),
      },
      ctx.now,
    ),
});
