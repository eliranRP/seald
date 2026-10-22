import { Global, Module } from '@nestjs/common';
import { AUTOMATION_EVENT_HOOK } from './automation-event-hook';
import { AutomationWorkerService } from './automation-worker.service';
import { AutomationsPgRepository } from './automations.repository.pg';
import { AutomationMatcherService } from './matcher';

/**
 * Workflow automations (A1). Global so `EnvelopesPgRepository` can take the
 * optional `AUTOMATION_EVENT_HOOK` without `EnvelopesModule` importing this
 * module. No routes in A1. Everything is inert while `workflowAutomations`
 * is off or `AUTOMATIONS_DISABLED=true`: no trigger rows, no matching, no
 * worker, and no database query at boot.
 */
@Global()
@Module({
  providers: [
    AutomationsPgRepository,
    AutomationMatcherService,
    AutomationWorkerService,
    { provide: AUTOMATION_EVENT_HOOK, useExisting: AutomationMatcherService },
  ],
  exports: [
    AUTOMATION_EVENT_HOOK,
    AutomationsPgRepository,
    AutomationMatcherService,
    AutomationWorkerService,
  ],
})
export class AutomationsModule {}
