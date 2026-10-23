import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ApprovalKindRegistry } from '../../../approvals/kinds/approval-kind.registry';
import { SendGuardService } from '../../../approvals/send-guard.service';
import { BulkService } from '../../../bulk/bulk.service';
import { bulkSendKindHandler } from './bulk-send-kind';

/**
 * Plugs the real `bulk_send` handler into the approval kind registry at
 * boot, replacing the typed stub (WP-26). Provided by `McpModule`, so the
 * approvals module neither imports the bulk module nor changes.
 */
@Injectable()
export class LaterApprovalRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: ApprovalKindRegistry,
    private readonly bulk: BulkService,
    private readonly guard: SendGuardService,
  ) {}

  onModuleInit(): void {
    this.registry.register(bulkSendKindHandler({ bulk: this.bulk, guard: this.guard }));
  }
}
