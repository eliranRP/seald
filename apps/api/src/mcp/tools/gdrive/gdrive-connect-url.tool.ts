import { GdriveConnectUrlInputSchema, GdriveConnectUrlOutputSchema } from 'shared';
import { defineTool } from '../../tool';
import { DRIVE_READ_ANNOTATIONS } from './gdrive-annotations';

/**
 * `gdrive_connect_url` covers `GET /integrations/gdrive/oauth/url` (step
 * 8d). It returns the Seald settings page where the signed-in owner
 * starts Google's consent, not a consent URL: a consent link minted for
 * an API key would let whoever opens it bind their own Google account to
 * this Seald account.
 */
export const gdriveConnectUrlTool = defineTool({
  name: 'gdrive_connect_url',
  title: 'Link to connect Drive',
  description:
    'Returns the Seald page where the owner connects Google Drive. Show the url to the owner; the agent cannot complete Google consent. Afterwards call gdrive_list_accounts.',
  step: 'step-8d',
  scopes: ['gdrive:read'],
  annotations: { ...DRIVE_READ_ANNOTATIONS, openWorldHint: false },
  requiresFlags: ['gdriveIntegration'],
  input: GdriveConnectUrlInputSchema,
  output: GdriveConnectUrlOutputSchema,
  handler: async (_args, ctx) => ({
    url: ctx.services.drive.connectUrl(),
    note: "Open this URL in a browser and sign in to Seald. The agent cannot approve Google's consent screen.",
  }),
});
