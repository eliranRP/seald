import { NotFoundException } from '@nestjs/common';
import { API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS, uuid } from 'shared';
import { z } from 'zod';
import type { ApprovalKindHandler, DescribedSubject } from '../../../approvals/kinds/approval-kind';
import type { ConnectedAppsService } from '../../oauth/connected-apps.service';

const Args = z.strictObject({ connected_app_id: uuid });
type Args = z.infer<typeof Args>;

/**
 * `oauth_grant_revoke` (WP-45, D5) → `POST /me/connected-apps/:id/revoke`
 * (WP-27): the same `ConnectedAppsService` path, which kills every token
 * of the grant and expires its pending approvals. Only after the owner
 * approves with a sign-in from the last 10 minutes.
 */
export function oauthGrantRevokeHandler(
  apps: Pick<ConnectedAppsService, 'findLive' | 'revokeForOwner'>,
): ApprovalKindHandler<Args> {
  return {
    kind: 'oauth_grant_revoke',
    tool: 'connected_apps_revoke',
    actionLabel: 'Disconnect an app',
    ready: true,
    args: Args,
    highRisk: () => true,
    freshSignInSeconds: API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS,
    async describe(args, ctx): Promise<DescribedSubject> {
      const app = await apps.findLive(ctx.ownerId, args.connected_app_id);
      if (!app) throw new NotFoundException('connected_app_not_found');
      return {
        subjectKey: `oauth_grant:${app.id}`,
        envelopeId: null,
        title: null,
        recipients: [],
        pageCount: null,
        destination: null,
        files: [],
        fields: [],
        facts: [
          { label: 'App', value: app.client_name },
          { label: 'Website', value: app.client_host },
          { label: 'Scopes', value: [...app.scopes].sort().join(', ') },
        ],
      };
    },
    async execute(args, ctx) {
      await apps.revokeForOwner(ctx.ownerId, args.connected_app_id, ctx.now);
      return { revoked: true, connected_app_id: args.connected_app_id };
    },
  };
}
