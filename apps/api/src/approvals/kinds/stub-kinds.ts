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

/** Automations A3 (WP-30): an MCP recipe change that adds an external destination. */
export const automationExternalDestinationKind = stub({
  kind: 'automation_external_destination',
  tool: 'automations_upsert_recipe',
  actionLabel: 'Turn on an automation that sends data outside Seald',
  args: z.strictObject({ automation_id: uuid }),
});

/** WP-45: `DELETE /me`. The page repeats the irreversible-deletion warning. */
export const accountDeleteKind = stub({
  kind: 'account_delete',
  tool: 'account_delete',
  actionLabel: 'Delete your Seald account',
  args: z.strictObject({}),
});

/** WP-45: the key is shown once on the approval page only, never in a tool result. */
export const apiKeyCreateKind = stub({
  kind: 'api_key_create',
  tool: 'api_keys_create',
  actionLabel: 'Create an API key',
  args: z.strictObject({
    name: z.string().trim().min(1).max(80).optional(),
    scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
    expires_at: z.string().datetime({ offset: true }).optional(),
  }),
});

/** WP-45: revoke one of the owner's keys. */
export const apiKeyRevokeKind = stub({
  kind: 'api_key_revoke',
  tool: 'api_keys_revoke',
  actionLabel: 'Revoke an API key',
  args: z.strictObject({ api_key_id: uuid }),
});

/** WP-45: turning `require_owner_approval` off always needs approval; on applies at once. */
export const approvalRequiredToggleKind = stub({
  kind: 'approval_required_toggle',
  tool: 'approvals_set_required',
  actionLabel: 'Stop asking before each send',
  args: z.strictObject({ api_key_id: uuid, require_owner_approval: z.literal(false) }),
});

/**
 * WP-45: the owner signs as a signer of their own envelope. The approval
 * page is the signer's consent; never applies to another signer.
 */
export const envelopeSignAsSignerKind = stub({
  kind: 'envelope_sign_as_signer',
  tool: 'envelopes_sign_as_signer',
  actionLabel: 'Sign as yourself',
  args: z.strictObject({ envelope_id: uuid, signer_id: uuid }),
});
