import type { AutomationAction, AutomationTrigger } from 'shared';
import { AutomationTestRepository, type TestableRecipe } from '../automation-test.repository';

/** One `mcp_approvals` row as the approval rule sees it. */
export interface FakeApprovalRow {
  readonly createdAt: number;
  readonly approved: boolean;
}

/**
 * In-memory `AutomationTestRepository` for unit tests and the in-memory
 * e2e. Mirrors the pg rule: the newest approval row decides.
 */
export class FakeAutomationTestRepo extends AutomationTestRepository {
  readonly recipes = new Map<string, TestableRecipe>();
  readonly approvals = new Map<string, FakeApprovalRow[]>();
  approvalChecks = 0;

  addRecipe(input: {
    id: string;
    ownerId: string;
    action?: AutomationAction;
    trigger?: AutomationTrigger;
  }): void {
    this.recipes.set(input.id, {
      id: input.id,
      ownerId: input.ownerId,
      action: input.action ?? 'webhook',
      trigger: input.trigger ?? 'envelope_sealed',
    });
  }

  addApproval(automationId: string, approved: boolean): void {
    const rows = this.approvals.get(automationId) ?? [];
    rows.push({ createdAt: rows.length, approved });
    this.approvals.set(automationId, rows);
  }

  reset(): void {
    this.recipes.clear();
    this.approvals.clear();
    this.approvalChecks = 0;
  }

  async findRecipe(ownerId: string, automationId: string): Promise<TestableRecipe | null> {
    const r = this.recipes.get(automationId);
    return r && r.ownerId === ownerId ? r : null;
  }

  async recipeAwaitingApproval(_ownerId: string, automationId: string): Promise<boolean> {
    this.approvalChecks += 1;
    const rows = this.approvals.get(automationId) ?? [];
    const latest = [...rows].sort((a, b) => b.createdAt - a.createdAt)[0];
    return latest !== undefined && !latest.approved;
  }
}
