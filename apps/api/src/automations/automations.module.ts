import { Global, Module } from '@nestjs/common';
import { WebhookActionExecutor } from './actions/webhook/webhook.executor';
import { WebhookPgRepository } from './actions/webhook/webhook.repository.pg';
import { WebhookSecretsService } from './actions/webhook/webhook-secrets.service';
import { AUTOMATION_ACTION_EXECUTORS, type AutomationActionExecutors } from './automation-actions';
import { AUTOMATION_EVENT_HOOK } from './automation-event-hook';
import { AutomationWorkerService } from './automation-worker.service';
import { AutomationsCrudRepository } from './automations-crud.repository';
import { AutomationsCrudPgRepository } from './automations-crud.repository.pg';
import { AutomationsPgRepository } from './automations.repository.pg';
import { AutomationsService } from './automations.service';
import { AutomationMatcherService } from './matcher';
import { AutomationTestRateLimiter } from './test-event/automation-test-rate-limiter';
import { AutomationTestController } from './test-event/automation-test.controller';
import { AutomationTestRepository } from './test-event/automation-test.repository';
import { AutomationTestPgRepository } from './test-event/automation-test.repository.pg';
import { AutomationTestService } from './test-event/automation-test.service';

/**
 * Workflow automations (A1 + A2 webhook action + A2b test endpoint). Global
 * so `EnvelopesPgRepository` can take the optional `AUTOMATION_EVENT_HOOK`
 * without `EnvelopesModule` importing this module. One route so far,
 * `POST /automations/:id/test` (404 while the flag is off); the MCP
 * tools (WP-30) call `AutomationsService`.
 * Everything is inert while `workflowAutomations` is off or
 * `AUTOMATIONS_DISABLED=true`: no trigger rows, no matching, no worker, no
 * outbound request, and no database query at boot.
 */
@Global()
@Module({
  controllers: [AutomationTestController],
  providers: [
    AutomationsPgRepository,
    { provide: AutomationsCrudRepository, useClass: AutomationsCrudPgRepository },
    AutomationsService,
    AutomationMatcherService,
    AutomationWorkerService,
    WebhookPgRepository,
    WebhookSecretsService,
    WebhookActionExecutor,
    {
      provide: AUTOMATION_ACTION_EXECUTORS,
      useFactory: (webhook: WebhookActionExecutor): AutomationActionExecutors => ({ webhook }),
      inject: [WebhookActionExecutor],
    },
    { provide: AUTOMATION_EVENT_HOOK, useExisting: AutomationMatcherService },
    { provide: AutomationTestRepository, useClass: AutomationTestPgRepository },
    AutomationTestRateLimiter,
    AutomationTestService,
  ],
  exports: [
    AUTOMATION_EVENT_HOOK,
    AutomationsPgRepository,
    AutomationsService,
    AutomationMatcherService,
    AutomationWorkerService,
    WebhookSecretsService,
    // A2b: the MCP tool `automations_test_webhook` calls this same method.
    AutomationTestService,
  ],
})
export class AutomationsModule {}
