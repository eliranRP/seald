import { HttpException, HttpStatus } from '@nestjs/common';
import { API_KEY_SCOPES, uuid, type ApprovalKind } from 'shared';
import { z } from 'zod';
import type { ApprovalKindHandler } from './approval-kind';

/**
 * Typed stubs for kinds whose action has not shipped. The argument shape
 * is fixed now so the work package that ships the action only fills in
 * `describe` and `execute` and flips `ready`. A stub never opens a row:
 * `ApprovalsService.request` refuses it with `approval_kind_not_ready`
 * (409) before anything is written or emailed.
 */
export class ApprovalKindNotReadyError extends HttpException {
  constructor() {
    super('approval_kind_not_ready', HttpStatus.CONFLICT);
  }
}

function stub<A extends Record<string, unknown>>(def: {
  readonly kind: ApprovalKind;
  readonly tool: string;
  readonly actionLabel: string;
  readonly args: z.ZodType<A>;
}): ApprovalKindHandler<A> {
  return {
    ...def,
    ready: false,
    // Every stubbed action is high-risk: when it ships, Approve needs a
    // fresh session unless that work package argues otherwise.
    highRisk: () => true,
    describe: () => Promise.reject(new ApprovalKindNotReadyError()),
    execute: () => Promise.reject(new ApprovalKindNotReadyError()),
  };
}

/**
 * MCP step 15 (WP-26): confirm a bulk batch. The real handler needs the
 * bulk service, so `McpModule` registers it at boot (as WP-30 does for
 * automations) and this typed stub covers a build without that module.
 */
export const bulkSendKind = stub({
  kind: 'bulk_send',
  tool: 'envelopes_bulk_send_from_template',
  actionLabel: 'Send a document to several people',
  args: z.strictObject({ batch_id: uuid }),
});

/** Automations A3 (WP-30): an MCP recipe change that adds an external destination. */
export const automationExternalDestinationKind = stub({
  kind: 'automation_external_destination',
  tool: 'automations_upsert_recipe',
  actionLabel: 'Turn on an automation that sends data outside Seald',
  args: z.strictObject({ automation_id: uuid }),
});

// ---------------------------------------------------------------------------
// WP-45 (D5). These stubs hold each kind's place until boot: the real
// handlers need MeService, ApiKeysService and AutomationsService, whose
// modules the approvals module does not import, so the registrars in
// `src/mcp/tools/{account,api-keys,automations}` replace them through
// `ApprovalKindRegistry.register()` on module init. A unit spec that
// builds the registry by hand still sees `approval_kind_not_ready`.
// `envelope_sign_as_signer` is built in the registry itself.
// ---------------------------------------------------------------------------

/** `DELETE /me`. The page repeats the irreversible-deletion warning. */
export const accountDeleteKind = stub({
  kind: 'account_delete',
  tool: 'account_delete',
  actionLabel: 'Delete your Seald account',
  args: z.strictObject({}),
});

/** `GET /me/export`: the owner downloads the export from the approval page. */
export const accountExportKind = stub({
  kind: 'account_export',
  tool: 'account_export',
  actionLabel: 'Export your Seald data',
  args: z.strictObject({}),
});

/** The key is shown once on the approval page only, never in a tool result. */
export const apiKeyCreateKind = stub({
  kind: 'api_key_create',
  tool: 'api_keys_create',
  actionLabel: 'Create an API key',
  args: z.strictObject({
    name: z.string().trim().min(1).max(80).optional(),
    scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
    expires_in_days: z.number().int().min(1).max(365),
  }),
});

/** Revoke one of the owner's keys. */
export const apiKeyRevokeKind = stub({
  kind: 'api_key_revoke',
  tool: 'api_keys_revoke',
  actionLabel: 'Revoke an API key',
  args: z.strictObject({ api_key_id: uuid }),
});

/** Turning `require_owner_approval` off always needs approval; on applies at once. */
export const approvalRequiredToggleKind = stub({
  kind: 'approval_required_toggle',
  tool: 'approvals_set_required',
  actionLabel: 'Stop asking before each send',
  args: z.strictObject({ api_key_id: uuid, require_owner_approval: z.literal(false) }),
});

/** `POST /me/connected-apps/:id/revoke`: revoke one OAuth grant (WP-27's connected apps). */
export const oauthGrantRevokeKind = stub({
  kind: 'oauth_grant_revoke',
  tool: 'connected_apps_revoke',
  actionLabel: 'Disconnect an app',
  args: z.strictObject({ connected_app_id: uuid }),
});

/** `POST /automations/:id/rotate-secret`: the new secret is shown once on the approval page. */
export const automationRotateSecretKind = stub({
  kind: 'automation_rotate_secret',
  tool: 'automations_rotate_secret',
  actionLabel: 'Rotate a webhook signing secret',
  args: z.strictObject({ automation_id: uuid }),
});
