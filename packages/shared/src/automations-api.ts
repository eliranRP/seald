import { z } from 'zod';
import {
  AUTOMATION_RECIPE_IDS,
  AUTOMATION_SCOPES,
  MAX_AUTOMATION_EMAIL_RECIPIENTS,
} from './automations';
import { iso, uuid } from './envelope-contract';
import {
  AUTOMATION_PAYLOAD_DETAILS,
  AUTOMATION_RUN_STATUS_WORDS,
  AutomationOutputSchema,
  AutomationRunOutputSchema,
} from './mcp-automations';

/**
 * Owner HTTP API for automations (docs/design/workflow-automations.md
 * § Run history and recipe UI; parity plan WP-31). Session JWT only. The
 * routes call `AutomationsService`, the service the MCP tools call, so the
 * rules are the same. A webhook address is never returned; the signing
 * secret appears once, on create and on rotate.
 */

const recipientEmail = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(320));

const editable = {
  name: z.string().trim().min(1).max(80).optional(),
  scope: z.enum(AUTOMATION_SCOPES).optional(),
  template_id: uuid.optional(),
  /** Webhook recipes: the https address. Never returned. */
  url: z.string().trim().min(1).max(2048).optional(),
  payload_detail: z.enum(AUTOMATION_PAYLOAD_DETAILS).optional(),
  recipients: z.array(recipientEmail).max(MAX_AUTOMATION_EMAIL_RECIPIENTS).optional(),
};

export const CreateAutomationRequestSchema = z.strictObject({
  recipe: z.enum(AUTOMATION_RECIPE_IDS),
  ...editable,
});
export type CreateAutomationRequest = z.input<typeof CreateAutomationRequestSchema>;

export const UpdateAutomationRequestSchema = z
  .strictObject({ enabled: z.boolean().optional(), ...editable })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'nothing to update',
  });
export type UpdateAutomationRequest = z.input<typeof UpdateAutomationRequestSchema>;

/** The newest run of a recipe, for the list's last-run word. */
export const AutomationLastRunSchema = z.object({
  status: AutomationRunOutputSchema.shape.status,
  status_word: z.enum(AUTOMATION_RUN_STATUS_WORDS).nullable(),
  created_at: iso,
});

export const OwnerAutomationSchema = AutomationOutputSchema.extend({
  /** Webhook recipes only: the signing secret exists. The value is never listed. */
  secret_set: z.boolean(),
  last_run: AutomationLastRunSchema.nullable(),
});
export type OwnerAutomation = z.infer<typeof OwnerAutomationSchema>;

export const OwnerAutomationListSchema = z.object({
  items: z.array(OwnerAutomationSchema),
  next_cursor: z.string().nullable(),
});
export type OwnerAutomationList = z.infer<typeof OwnerAutomationListSchema>;

export const OwnerAutomationResponseSchema = z.object({
  automation: OwnerAutomationSchema,
  /** Webhook create only. Shown once; it cannot be read again. */
  secret: z.string().optional(),
});
export type OwnerAutomationResponse = z.infer<typeof OwnerAutomationResponseSchema>;

export const RotateSecretResponseSchema = z.object({
  secret: z.string(),
  /** The previous secret keeps verifying until this time. */
  previous_retires_at: iso,
});
export type RotateSecretResponse = z.infer<typeof RotateSecretResponseSchema>;

export const OwnerRunListQuerySchema = z.strictObject({
  status: AutomationRunOutputSchema.shape.status.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(512).optional(),
});

/** Response of `POST /automations/:id/test` (see `AutomationTestResult`). */
export const AutomationTestResultSchema = z.object({
  ok: z.boolean(),
  event_id: z.string(),
  type: z.literal('automation.test'),
  response_status: z.number().int().nullable(),
  duration_ms: z.number(),
  response_truncated: z.boolean(),
  error: z.string().nullable(),
  transient: z.boolean(),
});
