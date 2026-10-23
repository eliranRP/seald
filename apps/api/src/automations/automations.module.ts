import { Global, Module } from '@nestjs/common';
import { EmailCopyLinkMinter } from './actions/email/email-copy-link-minter.service';
import { EmailCopyStopController } from './actions/email/email-copy-stop.controller';
import { EmailCopyActionExecutor } from './actions/email/email-copy.executor';
import { EmailCopyRepository } from './actions/email/email-copy.repository';
import { EmailCopyPgRepository } from './actions/email/email-copy.repository.pg';
import { GdriveUploadActionExecutor } from './actions/gdrive/gdrive-upload.executor';
import { GdriveUploadRepository } from './actions/gdrive/gdrive-upload.repository';
import { GdriveUploadPgRepository } from './actions/gdrive/gdrive-upload.repository.pg';
import { WebhookActionExecutor } from './actions/webhook/webhook.executor';
import { WebhookPgRepository } from './actions/webhook/webhook.repository.pg';
import { WebhookSecretsService } from './actions/webhook/webhook-secrets.service';
import { GDriveModule } from '../integrations/gdrive/gdrive.module';
import { AUTOMATION_ACTION_EXECUTORS, type AutomationActionExecutors } from './automation-actions';
import { AUTOMATION_EVENT_HOOK } from './automation-event-hook';
import { AutoDisableService, AutoDisableStore, PgAutoDisableStore } from './auto-disable';
import { AutomationWorkerService } from './automation-worker.service';
import { AutomationsCrudRepository } from './automations-crud.repository';
import { AutomationsCrudPgRepository } from './automations-crud.repository.pg';
import { AutomationsPgRepository } from './automations.repository.pg';
import { AutomationsService } from './automations.service';
import { AutomationMatcherService } from './matcher';
import { AutomationsOwnerController } from './owner/automations-owner.controller';
import { AutomationsOwnerService } from './owner/automations-owner.service';
import { AutomationTestRateLimiter } from './test-event/automation-test-rate-limiter';
import { AutomationTestController } from './test-event/automation-test.controller';
import { AutomationTestRepository } from './test-event/automation-test.repository';
import { AutomationTestPgRepository } from './test-event/automation-test.repository.pg';
import { AutomationTestService } from './test-event/automation-test.service';

/**
 * Workflow automations (A1 + A2 webhook action + A2b test endpoint). Global
 * so `EnvelopesPgRepository` can take the optional `AUTOMATION_EVENT_HOOK`
 * without `EnvelopesModule` importing this module. Owner routes
 * (`/automations`, WP-31, plus `POST /automations/:id/test`) answer 404
 * while the flag is off; they and the MCP tools (WP-30) both call
 * `AutomationsService`.
 * Everything is inert while `workflowAutomations` is off or
 * `AUTOMATIONS_DISABLED=true`: no trigger rows, no matching, no worker, no
 * outbound request, and no database query at boot.
 */
@Global()
@Module({
  imports: [GDriveModule],
  // Order matters: the public `GET /automations/stop` must register before
  // the owner's `GET /automations/:id`, or `:id` would swallow it.
  controllers: [EmailCopyStopController, AutomationsOwnerController, AutomationTestController],
  providers: [
    { provide: EmailCopyRepository, useClass: EmailCopyPgRepository },
    EmailCopyActionExecutor,
    EmailCopyLinkMinter,
    { provide: GdriveUploadRepository, useClass: GdriveUploadPgRepository },
    GdriveUploadActionExecutor,
    AutomationsPgRepository,
    { provide: AutomationsCrudRepository, useClass: AutomationsCrudPgRepository },
    AutomationsService,
    AutomationsOwnerService,
    AutomationMatcherService,
    AutomationWorkerService,
    { provide: AutoDisableStore, useClass: PgAutoDisableStore },
    AutoDisableService,
    WebhookPgRepository,
    WebhookSecretsService,
    WebhookActionExecutor,
    {
      provide: AUTOMATION_ACTION_EXECUTORS,
      useFactory: (
        webhook: WebhookActionExecutor,
        emailCopy: EmailCopyActionExecutor,
        gdriveUpload: GdriveUploadActionExecutor,
      ): AutomationActionExecutors => ({
        webhook,
        email_copy: emailCopy,
        gdrive_upload: gdriveUpload,
      }),
      inject: [WebhookActionExecutor, EmailCopyActionExecutor, GdriveUploadActionExecutor],
    },
    { provide: AUTOMATION_EVENT_HOOK, useExisting: AutomationMatcherService },
    { provide: AutomationTestRepository, useClass: AutomationTestPgRepository },
    AutomationTestRateLimiter,
    AutomationTestService,
  ],
  exports: [
    EmailCopyLinkMinter,
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
