import { z } from 'zod';
import { API_KEY_NAME_MAX, API_KEY_SCOPES, API_KEY_STATUSES, API_KEY_TTL_CHOICES_DAYS } from './api-keys';
import { ApprovalPendingResultSchema } from './approvals';
import { iso, uuid } from './envelope-contract';
import { McpIdempotencyKeySchema } from './mcp-write';

/**
 * MCP parity for the approval-gated actions (parity plan D5, WP-45).
 *
 * Every tool here except the two reads (`api_keys_list`) and turning
 * owner approval back on returns `approval_pending` and does nothing
 * until the owner approves on the Approve/Deny page with a sign-in from
 * the last 10 minutes. The agent never sees a secret: a key the owner
 * approves, or a rotated webhook secret, is shown once on that page.
 *
 * Scopes: `account:admin` (account delete and export), `keys:admin`
 * (keys and the approval setting), `envelopes:sign` (the owner signs as
 * a signer of their own envelope). None is pre-checked on the
 * Developers page.
 */

const write = {
  idempotency_key: McpIdempotencyKeySchema,
  dry_run: z.boolean(),
};

// ---------------------------------------------------------------------------
// Account (`account:admin`)
// ---------------------------------------------------------------------------

export const AccountDeleteInputSchema = z.strictObject({ ...write });
export const AccountDeleteOutputSchema = ApprovalPendingResultSchema;

export const AccountExportInputSchema = z.strictObject({ ...write });
export const AccountExportOutputSchema = ApprovalPendingResultSchema;

// ---------------------------------------------------------------------------
// API keys (`keys:admin`)
// ---------------------------------------------------------------------------

/** Expiry choices an agent may ask for; the Developers page offers the same. */
export const ApiKeyTtlDaysSchema = z.union([
  z.literal(API_KEY_TTL_CHOICES_DAYS[0]),
  z.literal(API_KEY_TTL_CHOICES_DAYS[1]),
  z.literal(API_KEY_TTL_CHOICES_DAYS[2]),
]);

export const ApiKeysListInputSchema = z.strictObject({});

/**
 * One key, as an agent may see it. No secret, no hash, and not the
 * displayed `seald_live_…` prefix either: `key_hint` is the eight
 * characters after it, enough to tell keys apart.
 */
export const McpApiKeySchema = z.object({
  api_key_id: uuid,
  name: z.string(),
  key_hint: z.string(),
  scopes: z.array(z.enum(API_KEY_SCOPES)),
  status: z.enum(API_KEY_STATUSES),
  require_owner_approval: z.boolean(),
  always_require_signin: z.boolean(),
  created_at: iso,
  last_used_at: iso.nullable(),
  expires_at: iso.nullable(),
  /** The key that made this call. */
  is_this_key: z.boolean(),
});
export type McpApiKey = z.infer<typeof McpApiKeySchema>;

export const ApiKeysListOutputSchema = z.object({
  /** Live and expired keys, newest first. At most 10 are live, so there is one page. */
  items: z.array(McpApiKeySchema),
});
export type ApiKeysListOutput = z.infer<typeof ApiKeysListOutputSchema>;

export const ApiKeysCreateInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(API_KEY_NAME_MAX).optional(),
  /** Every scope must also be on the calling key: a key never mints a wider one. */
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1).max(API_KEY_SCOPES.length),
  /** Days until the new key expires, counted from Approve. Default 90. */
  expires_in_days: ApiKeyTtlDaysSchema.optional(),
  ...write,
});
export const ApiKeysCreateOutputSchema = ApprovalPendingResultSchema;

export const ApiKeysRevokeInputSchema = z.strictObject({ api_key_id: uuid, ...write });
export const ApiKeysRevokeOutputSchema = ApprovalPendingResultSchema;

/**
 * `approvals_set_required`: `false` (stop asking before each send)
 * always goes through owner approval; `true` applies at once.
 */
export const ApprovalsSetRequiredInputSchema = z.strictObject({
  /** Defaults to the calling key. */
  api_key_id: uuid.optional(),
  require_owner_approval: z.boolean(),
  ...write,
});

export const ApprovalsSetRequiredAppliedSchema = z.object({
  status: z.literal('applied'),
  api_key_id: uuid,
  require_owner_approval: z.literal(true),
});

export const ApprovalsSetRequiredOutputSchema = z.union([
  ApprovalPendingResultSchema,
  ApprovalsSetRequiredAppliedSchema,
]);
export type ApprovalsSetRequiredOutput = z.infer<typeof ApprovalsSetRequiredOutputSchema>;

// ---------------------------------------------------------------------------
// Connected apps (OAuth grants, WP-27) (`keys:admin`)
// ---------------------------------------------------------------------------

export const ConnectedAppsListInputSchema = z.strictObject({});

export const McpConnectedAppSchema = z.object({
  connected_app_id: uuid,
  client_name: z.string(),
  client_host: z.string(),
  unverified: z.boolean(),
  scopes: z.array(z.enum(API_KEY_SCOPES)),
  created_at: iso,
  last_used_at: iso.nullable(),
  /** The grant making this call. */
  is_this_app: z.boolean(),
});

export const ConnectedAppsListOutputSchema = z.object({
  /** Live grants, newest first. One page. */
  items: z.array(McpConnectedAppSchema),
});

export const ConnectedAppsRevokeInputSchema = z.strictObject({
  connected_app_id: uuid,
  ...write,
});
export const ConnectedAppsRevokeOutputSchema = ApprovalPendingResultSchema;

// ---------------------------------------------------------------------------
// The owner signs as a signer of their own envelope (`envelopes:sign`)
// ---------------------------------------------------------------------------

export const EnvelopesSignAsSignerInputSchema = z.strictObject({
  envelope_id: uuid,
  /**
   * The signer row to sign as. Optional when exactly one signer has the
   * account email; it must be that email either way.
   */
  signer_id: uuid.optional(),
  ...write,
});
export const EnvelopesSignAsSignerOutputSchema = ApprovalPendingResultSchema;

// ---------------------------------------------------------------------------
// Automations (`automations:write`)
// ---------------------------------------------------------------------------

export const AutomationsDeleteInputSchema = z.strictObject({ automation_id: uuid, ...write });
export const AutomationsDeleteOutputSchema = z.object({
  deleted: z.literal(true),
  automation_id: uuid,
});

export const AutomationsRotateSecretInputSchema = z.strictObject({
  automation_id: uuid,
  ...write,
});
export const AutomationsRotateSecretOutputSchema = ApprovalPendingResultSchema;

export type AccountDeleteInput = z.infer<typeof AccountDeleteInputSchema>;
export type ApiKeysCreateInput = z.infer<typeof ApiKeysCreateInputSchema>;
export type ApiKeysRevokeInput = z.infer<typeof ApiKeysRevokeInputSchema>;
export type ApprovalsSetRequiredInput = z.infer<typeof ApprovalsSetRequiredInputSchema>;
export type EnvelopesSignAsSignerInput = z.infer<typeof EnvelopesSignAsSignerInputSchema>;
