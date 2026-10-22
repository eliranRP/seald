import { GdriveFilesOutputSchema, GdriveSearchFilesInputSchema } from 'shared';
import { defineTool } from '../../tool';
import { DRIVE_FILE_SCOPE_NOTE, DRIVE_READ_ANNOTATIONS } from './gdrive-annotations';

/**
 * `gdrive_search_files` → `GDriveService.listFiles` with a name filter
 * (step 8d). Same file set as `gdrive_list_files`.
 */
export const gdriveSearchFilesTool = defineTool({
  name: 'gdrive_search_files',
  title: 'Search Drive files',
  description: `Finds Drive files whose name contains q (PDF, Google Docs and .docx). account_id is optional with one connected account. Pass next_cursor back as cursor for more. ${DRIVE_FILE_SCOPE_NOTE}`,
  step: 'step-8d',
  scopes: ['gdrive:read'],
  annotations: DRIVE_READ_ANNOTATIONS,
  requiresFlags: ['gdriveIntegration'],
  input: GdriveSearchFilesInputSchema,
  output: GdriveFilesOutputSchema,
  handler: async (args, ctx) => {
    const page = await ctx.services.drive.listFiles(ctx.principal.ownerId, {
      q: args.q,
      ...(args.account_id !== undefined ? { account_id: args.account_id } : {}),
      ...(args.mime !== undefined ? { mime: args.mime } : {}),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
      ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
    });
    return { account_id: page.account_id, files: [...page.files], next_cursor: page.next_cursor };
  },
});
