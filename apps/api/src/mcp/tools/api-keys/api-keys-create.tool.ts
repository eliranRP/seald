import { ForbiddenException } from '@nestjs/common';
import {
  API_KEY_DEFAULT_TTL_DAYS,
  ApiKeysCreateInputSchema,
  ApiKeysCreateOutputSchema,
  type ApiKeysCreateInput,
} from 'shared';
import { previewApproval, requestApproval } from '../../approval-pending';
import { defineWriteTool, type McpToolContext } from '../../tool';
import { GATED_ANNOTATIONS, GATED_GUIDANCE } from '../account/gated-helpers';
import { scopesBeyond } from './api-key-approval-kinds';

/** The approval's arguments: the expiry is fixed at request time (default 90 days). */
function approvalArgs(args: ApiKeysCreateInput, ctx: McpToolContext): Record<string, unknown> {
  // The ceiling, checked here first so the agent hears it at once; the
  // approval kind checks it again against the key's row at decision time.
  if (scopesBeyond(args.scopes, ctx.principal.scopes).length > 0) {
    throw new ForbiddenException('scope_exceeds_key');
  }
  return {
    ...(args.name !== undefined ? { name: args.name } : {}),
    scopes: [...new Set(args.scopes)],
    expires_in_days: args.expires_in_days ?? API_KEY_DEFAULT_TTL_DAYS,
  };
}

/**
 * `api_keys_create` (WP-45, D5) → `POST /me/api-keys`, only after the
 * owner approves. The new key's secret is shown once on the approval
 * page and never in a tool result. A key never mints a key with a scope
 * it does not hold (`scope_exceeds_key`).
 */
export const apiKeysCreateTool = defineWriteTool({
  name: 'api_keys_create',
  title: 'Create an API key (owner approves)',
  description: `Asks the account owner to create a new API key with the given scopes and expiry (30, 90 or 365 days after Approve; default 90). Every scope must also be on this key: a wider request fails with scope_exceeds_key. The new key's secret is never returned to this tool: the owner sees it once on the approval page and gives it to the app that needs it. ${GATED_GUIDANCE} Needs keys:admin. Requires idempotency_key and dry_run.`,
  step: 'WP-45',
  scopes: ['keys:admin'],
  annotations: GATED_ANNOTATIONS,
  atomic: true,
  input: ApiKeysCreateInputSchema,
  output: ApiKeysCreateOutputSchema,
  preview: (args, ctx) => previewApproval(ctx, 'api_key_create', approvalArgs(args, ctx)),
  handler: (args, ctx) =>
    requestApproval(ctx, 'api_key_create', 'api_keys_create', approvalArgs(args, ctx)),
});
