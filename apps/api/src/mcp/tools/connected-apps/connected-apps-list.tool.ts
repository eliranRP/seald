import { ConnectedAppsListInputSchema, ConnectedAppsListOutputSchema } from 'shared';
import { defineTool } from '../../tool';

/**
 * `connected_apps_list` (WP-45, D5) → `GET /me/connected-apps` (WP-27):
 * the OAuth apps connected to the account. No token, no secret.
 */
export const connectedAppsListTool = defineTool({
  name: 'connected_apps_list',
  title: 'List connected apps',
  description:
    'Lists the apps connected to this Seald account through sign-in with Seald (OAuth): app name, website, scopes, and when each was connected and last used. is_this_app marks the app making this call. Needs keys:admin.',
  step: 'WP-45',
  scopes: ['keys:admin'],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  requiresFlags: ['mcpOauth'],
  input: ConnectedAppsListInputSchema,
  output: ConnectedAppsListOutputSchema,
  handler: async (_args, { principal, services }) => {
    const { items } = await services.connectedApps.listForOwner(principal.ownerId);
    return {
      items: items.map((app) => ({
        connected_app_id: app.id,
        client_name: app.client_name,
        client_host: app.client_host,
        unverified: app.unverified,
        scopes: app.scopes,
        created_at: app.created_at,
        last_used_at: app.last_used_at,
        is_this_app: principal.oauth?.grantId === app.id,
      })),
    };
  },
});
