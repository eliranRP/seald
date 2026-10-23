import type {
  AutomationAction,
  AutomationRunStatus,
  AutomationScope,
  AutomationTrigger,
} from 'shared';

/** One `automations` row. Never carries a secret or a URL: those live in `automation_secrets`. */
export interface AutomationRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly recipe: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly trigger: AutomationTrigger;
  readonly action: AutomationAction;
  readonly scope: AutomationScope;
  readonly templateId: string | null;
  readonly config: Readonly<Record<string, unknown>>;
  readonly consecutiveFailures: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NewAutomation {
  readonly ownerId: string;
  readonly recipe: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly trigger: AutomationTrigger;
  readonly action: AutomationAction;
  readonly scope: AutomationScope;
  readonly templateId: string | null;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface AutomationPatch {
  readonly name?: string;
  readonly enabled?: boolean;
  readonly scope?: AutomationScope;
  readonly templateId?: string | null;
  readonly config?: Readonly<Record<string, unknown>>;
}

/** One `automation_runs` row. `hasJob` is true while an `automation_jobs` row exists for it. */
export interface RunRecord {
  readonly id: string;
  readonly automationId: string;
  readonly ownerId: string;
  readonly envelopeId: string | null;
  readonly trigger: AutomationTrigger;
  readonly action: AutomationAction;
  readonly status: AutomationRunStatus;
  readonly retryable: boolean;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly responseStatus: number | null;
  readonly hasJob: boolean;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface PageCursor {
  /** Timestamp text exactly as Postgres returned it (microseconds kept). */
  readonly at: string;
  readonly id: string;
}

export interface ListRunsQuery {
  readonly automationId?: string;
  readonly status?: AutomationRunStatus;
  readonly limit: number;
  readonly cursor: PageCursor | null;
}

export interface CursorRow<T> {
  readonly row: T;
  readonly cursor: PageCursor;
}

/**
 * Persistence for the automations service (recipes, run history, retry).
 * Every method is owner scoped. Separate from `AutomationsPgRepository`
 * (the matcher and worker queue) so the two tracks do not share a file.
 */
export abstract class AutomationsCrudRepository {
  abstract count(ownerId: string): Promise<number>;
  abstract insert(input: NewAutomation): Promise<AutomationRecord>;
  abstract find(ownerId: string, id: string): Promise<AutomationRecord | null>;
  /** Newest `updated_at` first. Fetches `limit + 1` so the caller can see a next page. */
  abstract list(
    ownerId: string,
    limit: number,
    cursor: PageCursor | null,
  ): Promise<CursorRow<AutomationRecord>[]>;
  abstract update(
    ownerId: string,
    id: string,
    patch: AutomationPatch,
  ): Promise<AutomationRecord | null>;
  abstract delete(ownerId: string, id: string): Promise<void>;
  abstract ownsTemplate(ownerId: string, templateId: string): Promise<boolean>;
  /**
   * Ids (of `ids`) that are waiting on an approval, by the one definition in
   * `automation-approval-state.ts` (newest approval unapproved and not
   * superseded). `POST /automations/:id/test` uses the same rule.
   */
  abstract awaitingApproval(ownerId: string, ids: readonly string[]): Promise<Set<string>>;
  /**
   * The owner saved the recipe in the app: settle its unapproved approvals
   * (close the open one, mark denied or expired ones superseded).
   */
  abstract supersedeApprovals(ownerId: string, id: string, now: Date): Promise<number>;
  /**
   * Queued jobs of a recipe whose destination just changed: the job goes,
   * the run is marked failed and retryable (`recipe_changed`), so nothing
   * queued for the old destination is sent to an unapproved one.
   */
  abstract parkPendingJobs(automationId: string): Promise<number>;

  abstract listRuns(ownerId: string, query: ListRunsQuery): Promise<CursorRow<RunRecord>[]>;
  abstract findRun(ownerId: string, runId: string): Promise<RunRecord | null>;
  /**
   * Re-enqueue a failed, retryable run under the same run id. A second
   * call while a job exists is a no-op (`noop`); `refused` means the run
   * is not failed and retryable.
   */
  abstract requeueRun(ownerId: string, runId: string): Promise<'queued' | 'noop' | 'refused'>;
}
