import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AutomationOutput,
  AutomationRunOutput,
  AutomationRunStatus,
  OwnerAutomation,
  OwnerAutomationList,
  OwnerAutomationResponse,
  RotateSecretResponse,
} from 'shared';
import { requireFlag } from '../../common/feature-flag.guard';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import { AutomationsService, type Page, type UpsertRecipeInput } from '../automations.service';

/** The owner's own saves: no MCP approval, the recipe is on once saved. */
const SIGNED_IN = { requireApproval: false } as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OwnerUpdateInput extends UpsertRecipeInput {
  readonly enabled?: boolean | undefined;
}

/**
 * The settings page's API (docs/design/workflow-automations.md § Run
 * history and recipe UI; parity plan WP-31). A thin layer over
 * `AutomationsService`, the service the MCP tools call: the validation,
 * limits and run rules are that service's. What lives here is what only a
 * signed-in owner gets: Save is the owner's own decision (no approval, and
 * any approval an agent left behind is settled), the webhook secret is
 * handed over once, and the list carries the last-run word.
 *
 * Every method is flag-gated (404 while `workflowAutomations` is off or
 * `AUTOMATIONS_DISABLED=true`) and owner scoped; another owner's id is 404.
 */
@Injectable()
export class AutomationsOwnerService {
  constructor(
    private readonly automations: AutomationsService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /** 404 while dark. Runs before any id or body check so a dark route never answers 400. */
  gate(): void {
    requireFlag('workflowAutomations');
    if (this.env.AUTOMATIONS_DISABLED === true) throw new NotFoundException('not_found');
  }

  /** A malformed id names no recipe: 404, like the test endpoint. */
  static requireId(id: string): string {
    if (!UUID_RE.test(id)) throw new NotFoundException('not_found');
    return id;
  }

  async list(ownerId: string): Promise<OwnerAutomationList> {
    const page = await this.automations.list(ownerId);
    const items = await Promise.all(page.items.map((a) => this.decorate(ownerId, a)));
    return { items, next_cursor: page.next_cursor };
  }

  async get(ownerId: string, id: string): Promise<OwnerAutomation> {
    return this.decorate(ownerId, await this.automations.get(ownerId, id));
  }

  async create(ownerId: string, input: UpsertRecipeInput): Promise<OwnerAutomationResponse> {
    const out = await this.automations.upsertRecipe(ownerId, input, SIGNED_IN);
    return {
      automation: await this.decorate(ownerId, out.automation),
      ...(out.webhookSecret !== undefined ? { secret: out.webhookSecret } : {}),
    };
  }

  async update(
    ownerId: string,
    id: string,
    input: OwnerUpdateInput,
  ): Promise<OwnerAutomationResponse> {
    const { enabled, ...edits } = input;
    const edited = Object.values(edits).some((v) => v !== undefined);
    if (edited)
      await this.automations.upsertRecipe(ownerId, { ...edits, automationId: id }, SIGNED_IN);
    if (enabled !== undefined) await this.automations.setEnabled(ownerId, id, enabled, SIGNED_IN);
    return { automation: await this.get(ownerId, id) };
  }

  remove(ownerId: string, id: string): Promise<void> {
    return this.automations.remove(ownerId, id);
  }

  async rotateSecret(ownerId: string, id: string): Promise<RotateSecretResponse> {
    const rotated = await this.automations.rotateWebhookSecret(ownerId, id);
    return {
      secret: rotated.secret,
      previous_retires_at: rotated.previousRetiresAt.toISOString(),
    };
  }

  listRuns(
    ownerId: string,
    id: string,
    query: { status?: AutomationRunStatus; limit?: number; cursor?: string },
  ): Promise<Page<AutomationRunOutput>> {
    return this.automations.listRuns(ownerId, {
      automationId: id,
      limit: query.limit ?? 20,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
  }

  getRun(ownerId: string, runId: string): Promise<AutomationRunOutput> {
    return this.automations.getRun(ownerId, runId);
  }

  /** Retry a run of this recipe. A run of another recipe is 404 here. */
  async retryRun(ownerId: string, id: string, runId: string) {
    const run = await this.automations.getRun(ownerId, runId);
    if (run.automation_id !== id) throw new NotFoundException('automation_run_not_found');
    return this.automations.retryRun(ownerId, runId);
  }

  private async decorate(ownerId: string, a: AutomationOutput): Promise<OwnerAutomation> {
    const newest = await this.automations.listRuns(ownerId, { automationId: a.id, limit: 1 });
    const run = newest.items[0];
    return {
      ...a,
      // A webhook recipe cannot exist without its secret; the value is never listed.
      secret_set: a.action === 'webhook',
      last_run: run
        ? { status: run.status, status_word: run.status_word, created_at: run.created_at }
        : null,
    };
  }
}
