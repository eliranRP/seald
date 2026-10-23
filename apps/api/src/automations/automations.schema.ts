import type { ColumnType, DrainOuterGeneric, Generated, Kysely, Transaction } from 'kysely';
import type {
  AutomationAction,
  AutomationRunStatus,
  AutomationScope,
  AutomationTrigger,
} from 'shared';
import type { Database } from '../../db/schema';

/**
 * Kysely shapes for migration 0031 (workflow automations, A1). Kept beside
 * the module instead of in `db/schema.ts` so the automations track does not
 * touch the shared schema file; repositories widen their handle with
 * `withAutomationTables`.
 */

type Timestamp = ColumnType<Date, string | undefined, string | undefined>;
type NullableTimestamp = ColumnType<
  Date | null,
  string | null | undefined,
  string | null | undefined
>;

export interface AutomationsTable {
  id: Generated<string>;
  owner_id: string;
  recipe: string;
  name: string;
  enabled: ColumnType<boolean, boolean | undefined, boolean | undefined>;
  trigger: AutomationTrigger;
  action: AutomationAction;
  scope: ColumnType<AutomationScope, AutomationScope | undefined, AutomationScope | undefined>;
  template_id: string | null;
  config: ColumnType<Record<string, unknown>, string, string | undefined>;
  consecutive_failures: ColumnType<number, number | undefined, number | undefined>;
  /** Set by 0037 when the recipe is auto-disabled (A8). Null while on, and after a re-enable. */
  disabled_at: NullableTimestamp;
  disabled_reason: ColumnType<
    'consecutive_failures' | null,
    'consecutive_failures' | null | undefined,
    'consecutive_failures' | null | undefined
  >;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: Timestamp;
}

export interface AutomationSecretsTable {
  automation_id: string;
  secret_ciphertext: Buffer;
  secret_nonce: Buffer;
  url_ciphertext: Buffer;
  url_nonce: Buffer;
  previous_ciphertext: Buffer | null;
  previous_nonce: Buffer | null;
  previous_retired_at: NullableTimestamp;
  created_at: ColumnType<Date, string | undefined, never>;
}

export type AutomationTriggerRowStatus = 'pending' | 'matched';

export interface AutomationTriggersTable {
  event_id: string;
  status: ColumnType<
    AutomationTriggerRowStatus,
    AutomationTriggerRowStatus | undefined,
    AutomationTriggerRowStatus | undefined
  >;
  created_at: ColumnType<Date, string | undefined, never>;
  matched_at: NullableTimestamp;
}

export type AutomationJobStatus = 'pending' | 'running';

export interface AutomationJobsTable {
  id: Generated<string>;
  run_id: string;
  automation_id: string;
  status: ColumnType<
    AutomationJobStatus,
    AutomationJobStatus | undefined,
    AutomationJobStatus | undefined
  >;
  attempts: ColumnType<number, number | undefined, number | undefined>;
  max_attempts: ColumnType<number, number | undefined, number | undefined>;
  scheduled_for: Timestamp;
  locked_at: NullableTimestamp;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface AutomationRunsTable {
  id: Generated<string>;
  automation_id: string;
  owner_id: string;
  envelope_id: string | null;
  event_id: string | null;
  signer_id: string | null;
  trigger: AutomationTrigger;
  action: AutomationAction;
  status: ColumnType<
    AutomationRunStatus,
    AutomationRunStatus | undefined,
    AutomationRunStatus | undefined
  >;
  retryable: ColumnType<boolean, boolean | undefined, boolean | undefined>;
  attempts: ColumnType<number, number | undefined, number | undefined>;
  last_error: string | null;
  response_status: number | null;
  created_at: ColumnType<Date, string | undefined, never>;
  finished_at: NullableTimestamp;
}

export interface AutomationMatcherCheckpointTable {
  id: ColumnType<number, number | undefined, never>;
  last_created_at: ColumnType<Date, string, string>;
  last_event_id: string;
  updated_at: Timestamp;
}

/** Migration 0034 (A7 email copy): one row per recipient-message sent that UTC day. */
export interface AutomationCopySendsTable {
  run_id: string;
  email: string;
  owner_id: string;
  day: ColumnType<string, string, string>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface AutomationCopySuppressionsTable {
  owner_id: string;
  email: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface AutomationCopyStopTokensTable {
  token_hash: string;
  owner_id: string;
  email: string;
  created_at: ColumnType<Date, string | undefined, never>;
  used_at: NullableTimestamp;
}

/** Column added to `envelopes` by 0031. Null until the use-template flow sets it. */
export interface EnvelopesSourceTemplateColumn {
  source_template_id: string | null;
}

export type AutomationTables = {
  automations: AutomationsTable;
  automation_secrets: AutomationSecretsTable;
  automation_triggers: AutomationTriggersTable;
  automation_jobs: AutomationJobsTable;
  automation_runs: AutomationRunsTable;
  automation_matcher_checkpoint: AutomationMatcherCheckpointTable;
  automation_copy_sends: AutomationCopySendsTable;
  automation_copy_suppressions: AutomationCopySuppressionsTable;
  automation_copy_stop_tokens: AutomationCopyStopTokensTable;
};

/** What 0031 adds on top of `Database`, as `withTables` takes it. */
export type AutomationTableAdditions = AutomationTables & {
  envelopes: EnvelopesSourceTemplateColumn;
};

export type AutomationsDatabase = DrainOuterGeneric<Database & AutomationTableAdditions>;

/**
 * Widens a `Kysely<Database>` (or a transaction, keeping its connection)
 * with the 0031 tables. Kysely carries no runtime table registry, so this
 * only changes the compile-time table map.
 */
export function withAutomationTables(db: Transaction<Database>): Transaction<AutomationsDatabase>;
export function withAutomationTables(db: Kysely<Database>): Kysely<AutomationsDatabase>;
export function withAutomationTables(
  db: Kysely<Database> | Transaction<Database>,
): Kysely<AutomationsDatabase> | Transaction<AutomationsDatabase> {
  if (db.isTransaction) {
    return (db as Transaction<Database>).withTables<AutomationTableAdditions>();
  }
  return db.withTables<AutomationTableAdditions>();
}
