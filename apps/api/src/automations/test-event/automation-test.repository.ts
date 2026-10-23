import type { AutomationAction, AutomationTrigger } from 'shared';

/** The recipe fields the test endpoint needs. No config, no secrets. */
export interface TestableRecipe {
  readonly id: string;
  readonly ownerId: string;
  readonly action: AutomationAction;
  readonly trigger: AutomationTrigger;
}

export {
  AUTOMATION_APPROVAL_KIND,
  AUTOMATION_APPROVAL_SUBJECT_PREFIX,
} from '../automation-approval-state';

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
   * The one definition lives in `automation-approval-state.ts` and is shared
   * with `AutomationsService` (WP-31): the recipe is blocked while its newest
   * `automation_external_destination` approval is unapproved and was not
   * superseded by the owner saving it in the app. Fail closed.
   */
  abstract recipeAwaitingApproval(ownerId: string, automationId: string): Promise<boolean>;
}
