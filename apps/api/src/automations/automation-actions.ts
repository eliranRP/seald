import type { AutomationAction } from 'shared';
import type { ClaimedAutomationJob } from './automations.repository.pg';

/**
 * What one action attempt returns to the worker. `last_error` only ever
 * stores the slug (or the status code): never an upstream body, a signer
 * name, an email address, or a webhook URL.
 */
export type AutomationActionOutcome =
  | { readonly kind: 'done'; readonly responseStatus?: number }
  /** Timeout, DNS, 408, 429, 5xx: retried with backoff. */
  | {
      readonly kind: 'transient';
      readonly slug: string;
      readonly responseStatus?: number;
      /** e.g. Drive `RateLimitedError.retryAfterMs`; wins when later than backoff. */
      readonly retryAfterMs?: number;
    }
  /**
   * Not a failure and not an attempt: the run waits until `until` (the
   * email-copy daily cap). The worker puts the job back without spending
   * the attempt, so a long wait never exhausts `max_attempts`.
   */
  | {
      readonly kind: 'deferred';
      readonly slug: string;
      readonly until: Date;
      readonly responseStatus?: undefined;
    }
  /** 4xx other than 408/429, SSRF rejection, missing connection, bad config. */
  | { readonly kind: 'permanent'; readonly slug: string; readonly responseStatus?: number };

export interface AutomationActionExecutor {
  execute(job: ClaimedAutomationJob): Promise<AutomationActionOutcome>;
}

/**
 * Executors by action. The webhook (WP-29) is registered in
 * `AutomationsModule`; Drive (WP-32) and email (WP-33) register next to it.
 * `slack` never gets one.
 */
export type AutomationActionExecutors = Partial<Record<AutomationAction, AutomationActionExecutor>>;

export const AUTOMATION_ACTION_EXECUTORS = Symbol('AUTOMATION_ACTION_EXECUTORS');

/** Slug for an action with no executor (Slack, or an action not built yet). */
export const ACTION_NOT_AVAILABLE = 'action_not_available';
