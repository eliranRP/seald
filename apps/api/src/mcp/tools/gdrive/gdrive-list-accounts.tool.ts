import { GdriveListAccountsInputSchema, GdriveListAccountsOutputSchema } from 'shared';
import { defineTool } from '../../tool';
import { DRIVE_READ_ANNOTATIONS } from './gdrive-annotations';

/** `gdrive_list_accounts` → `GDriveService.listAccounts`, as `GET /integrations/gdrive/accounts` (step 8d). */
export const gdriveListAccountsTool = defineTool({
  name: 'gdrive_list_accounts',
  title: 'List Drive accounts',
  description:
    'Lists the Google Drive accounts connected to this Seald account (id, Google email, when connected, and whether it needs reconnecting). No tokens are returned. With several accounts, pass account_id to the other Drive tools.',
  step: 'step-8d',
  scopes: ['gdrive:read'],
  annotations: { ...DRIVE_READ_ANNOTATIONS, openWorldHint: false },
  requiresFlags: ['gdriveIntegration'],
  input: GdriveListAccountsInputSchema,
  output: GdriveListAccountsOutputSchema,
  handler: async (_args, ctx) => ({
    accounts: [...(await ctx.services.drive.listAccounts(ctx.principal.ownerId))],
  }),
});
