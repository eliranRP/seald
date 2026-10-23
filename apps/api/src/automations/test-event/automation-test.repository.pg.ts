import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Database } from '../../../db/schema';
import { DB_TOKEN } from '../../db/db.provider';
import { withAutomationTables, type AutomationsDatabase } from '../automations.schema';
import {
  AUTOMATION_APPROVAL_KIND,
  AUTOMATION_APPROVAL_SUBJECT_PREFIX,
  AutomationTestRepository,
  type TestableRecipe,
} from './automation-test.repository';

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
    const latest = await this.db
      .selectFrom('mcp_approvals')
      .select(['approved_at'])
      .where('owner_id', '=', ownerId)
      .where('action', '=', AUTOMATION_APPROVAL_KIND)
      .where('subject_key', '=', `${AUTOMATION_APPROVAL_SUBJECT_PREFIX}${automationId}`)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(1)
      .executeTakeFirst();
    return latest !== undefined && latest.approved_at === null;
  }
}
