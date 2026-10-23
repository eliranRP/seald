import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AutomationTestResult } from 'shared';
import { requireFlag } from '../../common/feature-flag.guard';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import { WebhookActionExecutor } from '../actions/webhook/webhook.executor';
import { WEBHOOK_TEST_EVENT_TYPE } from '../actions/webhook/webhook-payload';
import {
  AUTOMATION_SECRETS_NOT_CONFIGURED,
  WebhookSecretsService,
} from '../actions/webhook/webhook-secrets.service';
import { AutomationTestRateLimiter } from './automation-test-rate-limiter';
import { AutomationTestRepository } from './automation-test.repository';

/** 409: an agent-made external destination the owner has not approved. No network call. */
export const RECIPE_NOT_APPROVED = 'recipe_not_approved';
/** 409: only webhook recipes have a test event (Drive and email do not). */
export const ACTION_NOT_TESTABLE = 'action_not_testable';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A2b `POST /automations/:id/test` (design doc § Run history and recipe
 * UI). Sends one `automation.test` event through the webhook action's own
 * delivery path, so the signature, SSRF pre-flight, pinned address, 10 s
 * timeout and 64 KB read cap are the ones a real run uses. Not stored as
 * a run and not an envelope event. The MCP tool `automations_test_webhook`
 * calls this same method when it ships.
 *
 * Order: flag → owner-scoped lookup (404) → approval (409
 * `recipe_not_approved`, before anything touches the network or the
 * secrets) → action (409) → secrets key (503) → rate limit (429) → send.
 */
@Injectable()
export class AutomationTestService {
  constructor(
    private readonly repo: AutomationTestRepository,
    private readonly secrets: WebhookSecretsService,
    private readonly executor: WebhookActionExecutor,
    private readonly limiter: AutomationTestRateLimiter,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async sendTest(
    ownerId: string,
    automationId: string,
    now: Date = new Date(),
  ): Promise<AutomationTestResult> {
    requireFlag('workflowAutomations');
    // The kill switch makes the feature behave as if the flag were off.
    if (this.env.AUTOMATIONS_DISABLED === true) throw new NotFoundException('not_found');

    // A malformed id is just an id that names no recipe (404, not 400).
    if (!UUID_RE.test(automationId)) throw new NotFoundException('not_found');

    const recipe = await this.repo.findRecipe(ownerId, automationId);
    if (!recipe) throw new NotFoundException('not_found');
    if (await this.repo.recipeAwaitingApproval(ownerId, recipe.id)) {
      throw new ConflictException(RECIPE_NOT_APPROVED);
    }
    if (recipe.action !== 'webhook') throw new ConflictException(ACTION_NOT_TESTABLE);
    if (!this.secrets.isConfigured()) {
      throw new ServiceUnavailableException(AUTOMATION_SECRETS_NOT_CONFIGURED);
    }
    this.limiter.consume(ownerId, recipe.id, now.getTime());

    const delivery = await this.executor.sendTest({
      automationId: recipe.id,
      trigger: recipe.trigger,
      now,
    });
    const { outcome } = delivery;
    return {
      ok: outcome.kind === 'done',
      event_id: delivery.eventId,
      type: WEBHOOK_TEST_EVENT_TYPE,
      response_status: outcome.responseStatus ?? null,
      duration_ms: delivery.durationMs,
      response_truncated: delivery.truncated,
      error: outcome.kind === 'done' ? null : outcome.slug,
      transient: outcome.kind === 'transient',
    };
  }
}
