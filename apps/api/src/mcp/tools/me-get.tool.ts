import { MCP_DAILY_CAPS, MeGetInputSchema, MeGetOutputSchema } from 'shared';
import { defineTool } from '../tool';

/**
 * `me_get` — who the key acts for: the same facts as `GET /me` (id and
 * email), plus the key's scopes, approval mode and daily allowance. No
 * scope beyond a valid credential.
 */
export const meGetTool = defineTool({
  name: 'me_get',
  title: 'Account and key',
  description:
    'Returns the Seald account this API key acts for: account id, email, the scopes this key holds, whether the owner must approve sends, and the daily allowance left. Call it first to learn what this key may do.',
  step: 'step-4',
  scopes: [],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  input: MeGetInputSchema,
  output: MeGetOutputSchema,
  handler: async (_args, { principal, services }) => ({
    id: principal.ownerId,
    email: await services.accounts.email(principal.ownerId),
    scopes: [...principal.scopes],
    require_owner_approval: principal.requireOwnerApproval,
    // No MCP tool can send yet (step 10 adds the counters), so the whole
    // daily allowance is left.
    quotas: {
      sends_remaining: MCP_DAILY_CAPS.sends,
      new_recipients_remaining: MCP_DAILY_CAPS.new_recipients,
      email_copies_remaining: MCP_DAILY_CAPS.email_copies,
    },
  }),
});
