import { ApiKeysListInputSchema, ApiKeysListOutputSchema, isApiKeyScope } from 'shared';
import { toWire } from '../../../api-keys/api-keys.service';
import { defineTool } from '../../tool';
import { keyHint } from './api-key-approval-kinds';

/**
 * `api_keys_list` (WP-45, D5) → the rows `GET /me/api-keys` lists. No
 * secret and no hash, and not the displayed `seald_live_…` prefix
 * either: `key_hint` is the eight characters after it.
 */
export const apiKeysListTool = defineTool({
  name: 'api_keys_list',
  title: 'List API keys',
  description:
    "Lists the account's API keys that are not revoked (at most 10 live, so one page): name, the eight characters that tell keys apart (key_hint), scopes, status, expiry and whether the owner approves each send. is_this_key marks the key making this call. A key's secret is never shown. Needs keys:admin.",
  step: 'WP-45',
  scopes: ['keys:admin'],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  input: ApiKeysListInputSchema,
  output: ApiKeysListOutputSchema,
  handler: async (_args, { principal, services, now }) => {
    const rows = await services.apiKeys.listForOwner(principal.ownerId);
    return {
      items: rows.map((row) => {
        const wire = toWire(row, now);
        return {
          api_key_id: wire.id,
          name: wire.name,
          key_hint: keyHint(wire.prefix),
          scopes: wire.scopes.filter(isApiKeyScope),
          status: wire.status,
          require_owner_approval: wire.require_owner_approval,
          always_require_signin: wire.always_require_signin,
          created_at: wire.created_at,
          last_used_at: wire.last_used_at,
          expires_at: wire.expires_at,
          is_this_key: !principal.oauth && wire.id === principal.keyId,
        };
      }),
    };
  },
});
