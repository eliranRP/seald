import {
  AUTOMATION_MAX_ATTEMPTS,
  MAX_AUTOMATIONS_PER_OWNER,
  isFeatureEnabled,
  type AutomationRecipeId,
  type AutomationRunOutput,
  type AutomationTrigger,
} from 'shared';
import type { ApiError } from '@/lib/api/apiClient';
import type { RunListItem } from '@/components/RunList';

/** The automations page is on only with `workflowAutomations` on. */
export function isAutomationsEnabled(): boolean {
  return isFeatureEnabled('workflowAutomations');
}

export type RecipeKind = 'webhook' | 'drive' | 'email';

export interface RecipeCard {
  readonly id: AutomationRecipeId;
  readonly kind: RecipeKind;
  /** The name the server gives the recipe. */
  readonly title: string;
  /** One short line. */
  readonly line: string;
}

/**
 * The gallery. One line each and "Use this". The Drive card needs the
 * Drive integration, so it shows only with `gdriveIntegration` on.
 */
const ALL_CARDS: readonly RecipeCard[] = [
  {
    id: 'sealed_save_drive',
    kind: 'drive',
    title: 'Save sealed copies to Drive',
    line: 'Every finished document lands in My Drive / Seald.',
  },
  {
    id: 'sealed_webhook',
    kind: 'webhook',
    title: 'Send a webhook when sealed',
    line: 'Post a signed message to your own address when a document is sealed.',
  },
  {
    id: 'completed_email_copy',
    kind: 'email',
    title: 'Email a copy when sealed',
    line: 'Get the finished document in your own inbox.',
  },
  {
    id: 'declined_notify_me',
    kind: 'email',
    title: 'Email me when someone declines',
    line: 'A short note the moment a signer declines.',
  },
];

export function recipeCards(): readonly RecipeCard[] {
  const drive = isFeatureEnabled('gdriveIntegration');
  return ALL_CARDS.filter((card) => card.kind !== 'drive' || drive);
}

export function recipeCard(id: string | null): RecipeCard | null {
  return ALL_CARDS.find((card) => card.id === id) ?? null;
}

export const TRIGGER_LABELS: Readonly<Record<AutomationTrigger, string>> = {
  envelope_sealed: 'Document sealed',
  signer_signed: 'Someone signed',
  signer_declined: 'Someone declined',
  envelope_expired: 'Document expired',
  envelope_viewed: 'Document opened',
  envelope_sent: 'Document sent',
};

const DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function formatWhen(iso: string): string {
  return DATE.format(new Date(iso));
}

/** One run for `RunList`. A finished success is "succeeded", which the list calls Done. */
export function toRunItem(run: AutomationRunOutput): RunListItem {
  return {
    id: run.id,
    title: TRIGGER_LABELS[run.trigger],
    when: formatWhen(run.created_at),
    status: run.status === 'done' ? 'succeeded' : run.status,
    attempt: run.attempts,
    maxAttempts: AUTOMATION_MAX_ATTEMPTS,
    reason: run.failure_message ?? undefined,
    retryable: run.retry_allowed,
  };
}

/** Failure slugs whose fix is on the Drive integration page, not in the recipe. */
const DRIVE_FIX_SLUGS: ReadonlySet<string> = new Set([
  'reconnect_required',
  'gdrive_not_connected',
  'permission-denied',
]);

export type FixTarget = 'integrations' | 'recipe';

/** Where "Fix" goes for a failed run that Retry cannot help. */
export function fixTarget(run: AutomationRunOutput): FixTarget {
  return run.failure_slug !== null && DRIVE_FIX_SLUGS.has(run.failure_slug)
    ? 'integrations'
    : 'recipe';
}

/** The API's slug on a failed call, if it sent one. */
export function errorCode(err: unknown): string | undefined {
  return (err as ApiError | null)?.code;
}

export function errorStatus(err: unknown): number | undefined {
  return (err as ApiError | null)?.status;
}

const SAVE_PROBLEMS: Readonly<Record<string, string>> = {
  webhook_url_blocked: "Seald can't send to that address. Use a public https address.",
  webhook_url_required: 'Add the address Seald should send to.',
  automation_limit_reached: `You have ${MAX_AUTOMATIONS_PER_OWNER} automations. Delete one to add another.`,
  automation_secrets_not_configured: "Automations aren't available right now.",
  recipe_not_available: "This kind of automation isn't available yet.",
  validation_error: 'Check the details and try again.',
};

/** Plain-language reason a save failed. */
export function saveProblem(err: unknown): string {
  const code = errorCode(err);
  return (code ? SAVE_PROBLEMS[code] : undefined) ?? "Couldn't save. Try again.";
}

/** Plain-language result of "Send test event" that did not reach the receiver. */
export function testProblem(err: unknown): string {
  const code = errorCode(err);
  if (code === 'recipe_not_approved') {
    return 'This automation is waiting for your approval. Turn it on first.';
  }
  if (errorStatus(err) === 429) return 'Too many tests. Try again in a minute.';
  if (code === 'automation_secrets_not_configured')
    return "Automations aren't available right now.";
  return "Couldn't send the test. Try again.";
}
