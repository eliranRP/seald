import { ConnectedAppsRevokeInputSchema, ConnectedAppsRevokeOutputSchema } from 'shared';
import { previewApproval, requestApproval } from '../../approval-pending';
import { defineWriteTool } from '../../tool';
import { GATED_DESTRUCTIVE_ANNOTATIONS, GATED_GUIDANCE } from '../account/gated-helpers';

/**
 * `connected_apps_revoke` (WP-45, D5) → `POST /me/connected-apps/:id/revoke`
 * (WP-27), only after the owner approves. The app's tokens stop working
 * and its pending approvals expire, as from the Developers page.
 */
export const connectedAppsRevokeTool = defineWriteTool({
  name: 'connected_apps_revoke',
  title: 'Disconnect an app (owner approves)',
  description: `Asks the account owner to disconnect one connected app (connected_app_id from connected_apps_list). Its access stops at once and its pending approvals expire. Disconnecting the app making this call is allowed. ${GATED_GUIDANCE} Needs keys:admin. Requires idempotency_key and dry_run.`,
  step: 'WP-45',
  scopes: ['keys:admin'],
  annotations: GATED_DESTRUCTIVE_ANNOTATIONS,
  requiresFlags: ['mcpOauth'],
  atomic: true,
  input: ConnectedAppsRevokeInputSchema,
  output: ConnectedAppsRevokeOutputSchema,
  preview: (args, ctx) =>
    previewApproval(ctx, 'oauth_grant_revoke', { connected_app_id: args.connected_app_id }),
  handler: (args, ctx) =>
    requestApproval(ctx, 'oauth_grant_revoke', 'connected_apps_revoke', {
      connected_app_id: args.connected_app_id,
    }),
});
