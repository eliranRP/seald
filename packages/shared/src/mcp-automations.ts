import { z } from 'zod';
import { ApprovalPendingResultSchema } from './approvals';
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_RECIPE_IDS,
  AUTOMATION_RUN_STATUSES,
  AUTOMATION_SCOPES,
  AUTOMATION_TRIGGERS,
  MAX_AUTOMATION_EMAIL_RECIPIENTS,
} from './automations';
import { iso, uuid } from './envelope-contract';
import { MCP_LIST_LIMIT_MAX } from './mcp';
import { McpIdempotencyKeySchema } from './mcp-write';

/**
 * MCP automation tools (docs/design/mcp-server.md § Automations; parity
 * plan WP-30, automations A3). The tools call `AutomationsService`, the
 * same service the settings API uses. No output ever carries a webhook
 * URL or a signing secret: a recipe shows its destination host only.
 */

const write = {
  idempotency_key: McpIdempotencyKeySchema,
  dry_run: z.boolean(),
};

const limit = z.number().int().min(1).max(MCP_LIST_LIMIT_MAX);
const cursor = z.string().min(1).max(512);

export const AUTOMATION_PAYLOAD_DETAILS = ['ids', 'with_signer'] as const;
export type AutomationPayloadDetail = (typeof AUTOMATION_PAYLOAD_DETAILS)[number];

/** Status words a run shows. A queued or running run has none. */
export const AUTOMATION_RUN_STATUS_WORDS = ['Done', 'Failed', 'Retrying'] as const;
export type AutomationRunStatusWord = (typeof AUTOMATION_RUN_STATUS_WORDS)[number];

/** Fixed, plain-language sentence per failure slug. Never an upstream body. */
const FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  attempts_exhausted: 'Seald tried several times and the destination kept failing. Retry is safe.',
  action_not_available: 'This kind of automation is not available yet.',
  bad_config: 'The automation is not set up correctly. Edit it and save again.',
  webhook_not_configured: 'The webhook address is missing. Edit the automation and set it again.',
  webhook_secret_unreadable: 'The webhook secret could not be read. Rotate the secret in Seald.',
  envelope_missing: 'The envelope this run was for no longer exists.',
  webhook_url_blocked: 'Seald does not send to that address. Use a public https address.',
  webhook_redirect_blocked:
    'The destination answered with a redirect, which Seald does not follow.',
  webhook_dns_failed: 'The destination name could not be looked up. Retry later.',
  webhook_connect_failed: 'Seald could not connect to the destination. Retry later.',
  webhook_bad_status: 'The destination answered with a temporary error. Retry later.',
  action_error: 'Something went wrong on the Seald side. Retry later.',
  recipe_changed: 'The automation was changed before this run was sent. Retry once it is on.',
};

/** The sentence for a run's `last_error` slug, or null when there is none. */
export function automationFailureMessage(slug: string | null): string | null {
  if (slug === null) return null;
  const known = FAILURE_MESSAGES[slug];
  if (known) return known;
  const http = /^http_(\d{3})$/.exec(slug);
  if (http) return `The destination answered with HTTP ${http[1]}. Check the receiving end.`;
  return 'The run failed.';
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export const AutomationsListInputSchema = z.strictObject({
  limit: limit.optional(),
  cursor: cursor.optional(),
});

const recipientEmail = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(320));

export const AutomationsUpsertRecipeInputSchema = z
  .strictObject({
    /** The catalog recipe id. Required to create; on update it must match. */
    recipe: z.enum(AUTOMATION_RECIPE_IDS).optional(),
    /** Present: edit this automation. Absent: create one. */
    automation_id: uuid.optional(),
    name: z.string().trim().min(1).max(80).optional(),
    scope: z.enum(AUTOMATION_SCOPES).optional(),
    template_id: uuid.optional(),
    /** Webhook recipes: the https address. Never returned by any tool. */
    url: z.string().trim().min(1).max(2048).optional(),
    payload_detail: z.enum(AUTOMATION_PAYLOAD_DETAILS).optional(),
    /** Email recipes: up to ten addresses. Empty or absent means the owner's own mailbox. */
    recipients: z.array(recipientEmail).max(MAX_AUTOMATION_EMAIL_RECIPIENTS).optional(),
    ...write,
  })
  .refine((v) => v.recipe !== undefined || v.automation_id !== undefined, {
    message: 'recipe or automation_id is required',
  });

export const AutomationsSetEnabledInputSchema = z.strictObject({
  automation_id: uuid,
  enabled: z.boolean(),
  ...write,
});

export const AutomationsListRunsInputSchema = z.strictObject({
  automation_id: uuid.optional(),
  status: z.enum(AUTOMATION_RUN_STATUSES).optional(),
  limit: limit.optional(),
  cursor: cursor.optional(),
});

export const AutomationsGetRunInputSchema = z.strictObject({ run_id: uuid });

export const AutomationsRetryRunInputSchema = z.strictObject({ run_id: uuid, ...write });

// ---------------------------------------------------------------------------
// Outputs (plain objects: parsing drops any key not named here)
// ---------------------------------------------------------------------------

export const AutomationOutputSchema = z.object({
  id: uuid,
  recipe: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  /** `Off` for a disabled recipe, otherwise null. */
  status_word: z.literal('Off').nullable(),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  action: z.enum(AUTOMATION_ACTIONS),
  scope: z.enum(AUTOMATION_SCOPES),
  template_id: uuid.nullable(),
  /** Webhook destination hostname only. */
  destination_host: z.string().nullable(),
  payload_detail: z.enum(AUTOMATION_PAYLOAD_DETAILS).nullable(),
  recipients: z.array(z.string()).nullable(),
  /** True while an owner approval for this recipe is open. It does not run until approved. */
  awaiting_approval: z.boolean(),
  consecutive_failures: z.number().int(),
  created_at: iso,
  updated_at: iso,
});
export type AutomationOutput = z.infer<typeof AutomationOutputSchema>;

export const AutomationsListOutputSchema = z.object({
  items: z.array(AutomationOutputSchema),
  next_cursor: z.string().nullable(),
});

/**
 * One object for both results (a tool's output root must be an object, and
 * a dry run already adds one union level). `saved`: the recipe is in the
 * state `automation.enabled` says. `approval_pending`: it sends data
 * outside Seald, was saved off, and runs only if the owner approves; the
 * approval fields are the standard `approval_pending` result.
 */
export const AutomationsChangeOutputSchema = z.object({
  status: z.enum(['saved', 'approval_pending']),
  automation: AutomationOutputSchema,
  message: ApprovalPendingResultSchema.shape.message.optional(),
  approval_id: ApprovalPendingResultSchema.shape.approval_id.optional(),
  summary: ApprovalPendingResultSchema.shape.summary.optional(),
  review_url: ApprovalPendingResultSchema.shape.review_url.optional(),
  approve_requires: ApprovalPendingResultSchema.shape.approve_requires.optional(),
});

export const AutomationRunOutputSchema = z.object({
  id: uuid,
  automation_id: uuid,
  envelope_id: uuid.nullable(),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  action: z.enum(AUTOMATION_ACTIONS),
  status: z.enum(AUTOMATION_RUN_STATUSES),
  /** Done, Failed or Retrying. A queued or running run has none. */
  status_word: z.enum(AUTOMATION_RUN_STATUS_WORDS).nullable(),
  attempts: z.number().int(),
  /** The failure slug, never an upstream body. */
  failure_slug: z.string().nullable(),
  /** Plain-language failure for the owner. */
  failure_message: z.string().nullable(),
  response_status: z.number().int().nullable(),
  /** True only for a failed run that Retry may re-enqueue. */
  retry_allowed: z.boolean(),
  created_at: iso,
  finished_at: iso.nullable(),
});
export type AutomationRunOutput = z.infer<typeof AutomationRunOutputSchema>;

export const AutomationsListRunsOutputSchema = z.object({
  items: z.array(AutomationRunOutputSchema),
  next_cursor: z.string().nullable(),
});

export const AutomationsRetryRunOutputSchema = z.object({
  /** `already_queued`: a job for this run already exists, so a second tap does nothing. */
  status: z.enum(['queued', 'already_queued']),
  run: AutomationRunOutputSchema,
});
