import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPgMemDb, type PgMemHandle } from '../../../test/pg-mem-db';

/**
 * pg-mem database with migration 0031 applied on top of the shared
 * harness. The real file is loaded with pg-mem shims:
 *   - `begin;` / `commit;` stripped (pg-mem auto-commits each statement).
 *   - `do $$ … $$;` blocks stripped (pg-mem runs no procedural blocks); the guarded statements
 *     they hold — the enum types, the jobs→runs FK and the updated_at
 *     trigger — are re-issued plainly (the trigger is skipped, as in the
 *     shared harness).
 *   - `enable row level security` stripped (not implemented by pg-mem).
 * The real file runs unmodified against Postgres in
 * `test/automations.pg.e2e-spec.ts`.
 */
export function createAutomationsPgMemDb(): PgMemHandle {
  const handle = createPgMemDb();
  handle.mem.public.none(`
    create type automation_scope as enum ('account', 'template');
    create type automation_trigger as enum (
      'envelope_sealed', 'signer_signed', 'signer_declined',
      'envelope_expired', 'envelope_viewed', 'envelope_sent'
    );
    create type automation_action as enum ('webhook', 'gdrive_upload', 'email_copy', 'slack');
    create type automation_run_status as enum ('queued', 'running', 'done', 'retrying', 'failed');
  `);
  const raw = readFileSync(
    resolve(__dirname, '../../../db/migrations/0031_automations.sql'),
    'utf8',
  );
  const patched = raw
    .replace(/^--.*$/gm, '')
    .replace(/^\s*(begin|commit);\s*$/gm, '')
    .replace(/do \$\$[\s\S]*?\$\$;/g, '')
    .replace(/alter table public\.\w+ enable row level security;/g, '')
    .replace(/public\.automation_(scope|trigger|action|run_status)\b(?! *\()/g, 'automation_$1');
  handle.mem.public.none(patched);
  handle.mem.public.none(`
    alter table public.automation_jobs
      add constraint automation_jobs_run_id_fk
      foreign key (run_id) references public.automation_runs(id) on delete cascade;
  `);
  return handle;
}
