import { sql, type Kysely } from 'kysely';
import type { AutomationsDatabase } from './automations.schema';

/** `mcp_approvals.action` (= `ApprovalKind`) of an agent-made external destination. */
export const AUTOMATION_APPROVAL_KIND = 'automation_external_destination';
/** `mcp_approvals.subject_key` prefix for a recipe (`automation:<id>`). */
export const AUTOMATION_APPROVAL_SUBJECT_PREFIX = 'automation:';
/**
 * `expired_reason` of an approval the owner settled by saving the recipe
 * in the app. A superseded row never blocks the recipe again.
 */
export const SUPERSEDED_BY_OWNER_SAVE = 'superseded_by_owner_save';

/**
 * THE definition of "this recipe is waiting on an approval" (WP-31). It
 * backs `AutomationsService` (`awaiting_approval`, the MCP tools) and the
 * `POST /automations/:id/test` guard, so the two cannot disagree.
 *
 * A recipe is blocked when its NEWEST `automation_external_destination`
 * approval row has no `approved_at` and was not superseded by an owner
 * save: open, expired, denied, or failed before approval. Fail closed: a
 * denied or expired agent request keeps the recipe blocked until a newer
 * approval is granted or the owner saves it in the app. A recipe with no
 * such row was created in the app (or approved) and is not blocked.
 */
export async function unapprovedRecipeIds(
  db: Kysely<AutomationsDatabase>,
  ownerId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const keys = ids.map((id) => `${AUTOMATION_APPROVAL_SUBJECT_PREFIX}${id}`);
  const res = await sql<{ subject_key: string }>`
    select a.subject_key from public.mcp_approvals a
    where a.owner_id = ${ownerId}::uuid
      and a.action = ${AUTOMATION_APPROVAL_KIND}
      and a.subject_key = any(${keys}::text[])
      and a.approved_at is null
      and a.expired_reason is distinct from ${SUPERSEDED_BY_OWNER_SAVE}
      and not exists (
        select 1 from public.mcp_approvals b
        where b.owner_id = a.owner_id and b.action = a.action and b.subject_key = a.subject_key
          and (b.created_at, b.id) > (a.created_at, a.id)
      )
  `.execute(db);
  return new Set(
    res.rows.map((r) => r.subject_key.slice(AUTOMATION_APPROVAL_SUBJECT_PREFIX.length)),
  );
}

/**
 * The owner saved the recipe in the app: every approval for it that is
 * not approved is settled. Open rows are closed; denied, failed and
 * expired rows keep their history and are marked superseded. Returns the
 * number of rows touched.
 */
export async function supersedeRecipeApprovals(
  db: Kysely<AutomationsDatabase>,
  ownerId: string,
  id: string,
  now: Date,
): Promise<number> {
  const res = await sql`
    update public.mcp_approvals
    set expired_at = case
          when denied_at is null and failed_at is null and expired_at is null then ${now.toISOString()}::timestamptz
          else expired_at end,
        expired_reason = ${SUPERSEDED_BY_OWNER_SAVE},
        updated_at = ${now.toISOString()}::timestamptz
    where owner_id = ${ownerId}::uuid
      and action = ${AUTOMATION_APPROVAL_KIND}
      and subject_key = ${`${AUTOMATION_APPROVAL_SUBJECT_PREFIX}${id}`}
      and approved_at is null
      and expired_reason is distinct from ${SUPERSEDED_BY_OWNER_SAVE}
  `.execute(db);
  return Number(res.numAffectedRows ?? 0);
}
