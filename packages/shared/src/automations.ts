import type { EventType } from './envelope-contract';

/**
 * Workflow automations (docs/design/workflow-automations.md, step A1).
 *
 * The value lists below mirror the Postgres enums that migration
 * `0031_automations.sql` creates. Keep them in the same order. Recipes are
 * the product: one trigger and one action per recipe, chosen from the
 * catalog below. The feature is dark behind the `workflowAutomations` flag.
 */

export const AUTOMATION_SCOPES = ['account', 'template'] as const;
export type AutomationScope = (typeof AUTOMATION_SCOPES)[number];

export const AUTOMATION_TRIGGERS = [
  'envelope_sealed',
  'signer_signed',
  'signer_declined',
  'envelope_expired',
  'envelope_viewed',
  'envelope_sent',
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

/** `slack` exists so a later migration does not rewrite the enum. Not offered. */
export const AUTOMATION_ACTIONS = ['webhook', 'gdrive_upload', 'email_copy', 'slack'] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

export const AUTOMATION_RUN_STATUSES = ['queued', 'running', 'done', 'retrying', 'failed'] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

/**
 * Envelope event types that can start a recipe. Every other event type
 * (`created`, `field_filled`, `reminder_sent`, …) does not trigger recipes in
 * v1. `sealed` (not `all_signed`) is the completion trigger, because the
 * sealed and audit PDFs exist only from that point.
 */
export const AUTOMATION_TRIGGER_BY_EVENT_TYPE: Readonly<
  Partial<Record<EventType, AutomationTrigger>>
> = {
  sealed: 'envelope_sealed',
  signed: 'signer_signed',
  declined: 'signer_declined',
  expired: 'envelope_expired',
  viewed: 'envelope_viewed',
  sent: 'envelope_sent',
};

/** Maps an envelope event type to its recipe trigger, or null when unmapped. */
export function automationTriggerForEvent(eventType: string): AutomationTrigger | null {
  return AUTOMATION_TRIGGER_BY_EVENT_TYPE[eventType as EventType] ?? null;
}

export const AUTOMATION_RECIPE_IDS = [
  'sealed_save_drive',
  'sealed_webhook',
  'declined_notify_me',
  'signed_notify_list',
  'completed_email_copy',
  'viewed_notify_me',
  'sent_webhook',
  'expired_notify_me',
] as const;
export type AutomationRecipeId = (typeof AUTOMATION_RECIPE_IDS)[number];

export interface AutomationRecipe {
  readonly id: AutomationRecipeId;
  readonly trigger: AutomationTrigger;
  readonly action: AutomationAction;
}

/**
 * The recipe catalog (design doc § Recipes). Create rejects any recipe id or
 * trigger/action pair that is not in this table.
 */
export const AUTOMATION_RECIPES: Readonly<Record<AutomationRecipeId, AutomationRecipe>> = {
  sealed_save_drive: {
    id: 'sealed_save_drive',
    trigger: 'envelope_sealed',
    action: 'gdrive_upload',
  },
  sealed_webhook: { id: 'sealed_webhook', trigger: 'envelope_sealed', action: 'webhook' },
  declined_notify_me: {
    id: 'declined_notify_me',
    trigger: 'signer_declined',
    action: 'email_copy',
  },
  signed_notify_list: {
    id: 'signed_notify_list',
    trigger: 'signer_signed',
    action: 'email_copy',
  },
  completed_email_copy: {
    id: 'completed_email_copy',
    trigger: 'envelope_sealed',
    action: 'email_copy',
  },
  viewed_notify_me: { id: 'viewed_notify_me', trigger: 'envelope_viewed', action: 'email_copy' },
  sent_webhook: { id: 'sent_webhook', trigger: 'envelope_sent', action: 'webhook' },
  expired_notify_me: {
    id: 'expired_notify_me',
    trigger: 'envelope_expired',
    action: 'email_copy',
  },
};

/** Free-plan caps (design doc § Free-plan limits). */
export const MAX_AUTOMATIONS_PER_OWNER = 10;
export const MAX_AUTOMATION_EMAIL_RECIPIENTS = 10;
/** Automatic attempts before a temporary failure becomes `failed` + retryable. */
export const AUTOMATION_MAX_ATTEMPTS = 8;
