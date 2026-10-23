import type { AutomationAction, AutomationTrigger } from 'shared';

/** The recipe fields the test endpoint needs. No config, no secrets. */
export interface TestableRecipe {
  readonly id: string;
  readonly ownerId: string;
  readonly action: AutomationAction;
  readonly trigger: AutomationTrigger;
}

/** `mcp_approvals.action` (= `ApprovalKind`) of an agent-made external destination. */
export const AUTOMATION_APPROVAL_KIND = 'automation_external_destination';
/** `mcp_approvals.subject_key` prefix for a recipe (`automation:<id>`). */
export const AUTOMATION_APPROVAL_SUBJECT_PREFIX = 'automation:';

/**
 * Reads behind `POST /automations/:id/test` (A2b). Abstract so the
 * in-memory e2e can swap it; production binds `AutomationTestPgRepository`.
 */
export abstract class AutomationTestRepository {
  /** The owner's recipe, or null for an unknown id or another owner's recipe. */
  abstract findRecipe(ownerId: string, automationId: string): Promise<TestableRecipe | null>;

  /**
   * True while the recipe's external destination is not approved by the
   * owner, so a test must not call the network (`recipe_not_approved`).
   *
   * Rule (A2b, pending reconciliation with WP-30 / A3): recipes carry no
   * approval-state column, so the check reads `mcp_approvals`. The recipe
   * is blocked when its NEWEST `automation_external_destination` row for
   * subject `automation:<id>` has no `approved_at`: open, expired, denied,
   * or failed before approval. A recipe with no such row was saved in the
   * app (or approved) and can be tested. Fail closed: a denied or expired
   * agent request keeps the test off until a newer approval is granted.
   * WP-30's `AutomationsService.isAwaitingApproval` (open rows only) can
   * replace this once both land; keep this the only call site.
   */
  abstract recipeAwaitingApproval(ownerId: string, automationId: string): Promise<boolean>;
}
