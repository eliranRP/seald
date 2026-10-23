import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Database } from '../../../db/schema';
import { DB_TOKEN } from '../../db/db.provider';
import { withAutomationTables, type AutomationsDatabase } from '../automations.schema';
import { unapprovedRecipeIds } from '../automation-approval-state';
import { AutomationTestRepository, type TestableRecipe } from './automation-test.repository';

@Injectable()
export class AutomationTestPgRepository extends AutomationTestRepository {
  private readonly db: Kysely<AutomationsDatabase>;

  constructor(@Inject(DB_TOKEN) db: Kysely<Database>) {
    super();
    this.db = withAutomationTables(db);
  }

  async findRecipe(ownerId: string, automationId: string): Promise<TestableRecipe | null> {
    const row = await this.db
      .selectFrom('automations')
      .select(['id', 'owner_id', 'action', 'trigger'])
      .where('id', '=', automationId)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    return row
      ? { id: row.id, ownerId: row.owner_id, action: row.action, trigger: row.trigger }
      : null;
  }

  async recipeAwaitingApproval(ownerId: string, automationId: string): Promise<boolean> {
    return (await unapprovedRecipeIds(this.db, ownerId, [automationId])).has(automationId);
  }
}
