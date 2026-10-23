import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ApprovalKindRegistry } from '../../../approvals/kinds/approval-kind.registry';
import { AutomationsService } from '../../../automations/automations.service';
import { automationExternalDestinationHandler } from './automation-approval-kind';
import { automationRotateSecretHandler } from './automation-rotate-secret-kind';

/**
 * Plugs the real `automation_external_destination` handler (WP-30) and
 * the `automation_rotate_secret` handler (WP-45) into the approval kind
 * registry at boot, replacing the typed stubs that refused with
 * `approval_kind_not_ready`. Provided by `McpModule`, so neither the
 * approvals module nor `app.module.ts` changes.
 */
@Injectable()
export class AutomationApprovalRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: ApprovalKindRegistry,
    private readonly automations: AutomationsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(automationExternalDestinationHandler(this.automations));
    this.registry.register(automationRotateSecretHandler(this.automations));
  }
}
