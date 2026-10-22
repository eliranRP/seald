import { GdriveFilesOutputSchema, GdriveListFilesInputSchema } from 'shared';
import { defineTool } from '../../tool';
import { DRIVE_FILE_SCOPE_NOTE, DRIVE_READ_ANNOTATIONS } from './gdrive-annotations';

/** `gdrive_list_files` → `GDriveService.listFiles`, as `GET /integrations/gdrive/files` (step 8d). */
export const gdriveListFilesTool = defineTool({
  name: 'gdrive_list_files',
  title: 'List Drive files',
  description: `Lists PDF, Google Docs and .docx files in the connected Google Drive (mime: pdf, doc, docx or all). account_id is optional with one connected account. Pass next_cursor back as cursor for more. ${DRIVE_FILE_SCOPE_NOTE}`,
  step: 'step-8d',
  scopes: ['gdrive:read'],
  annotations: DRIVE_READ_ANNOTATIONS,
  requiresFlags: ['gdriveIntegration'],
  input: GdriveListFilesInputSchema,
  output: GdriveFilesOutputSchema,
  handler: async (args, ctx) => {
    const page = await ctx.services.drive.listFiles(ctx.principal.ownerId, {
      ...(args.account_id !== undefined ? { account_id: args.account_id } : {}),
      ...(args.mime !== undefined ? { mime: args.mime } : {}),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
    });
    return { account_id: page.account_id, files: [...page.files], next_cursor: page.next_cursor };
  },
});
