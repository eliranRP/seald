import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ApiKeysFlagMiddleware } from '../api-keys/api-keys-flag.middleware';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { GDriveModule } from '../integrations/gdrive/gdrive.module';
import { ApprovalCsrf } from './approval-csrf';
import { ApprovalRateLimiter } from './approval-rate-limiter';
import { ApprovalsCoreModule } from './approvals-core.module';
import { ApprovalsEmailController } from './approvals-email.controller';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { ApprovalKindRegistry } from './kinds/approval-kind.registry';

/**
 * Owner approvals (parity plan WP-21; MCP steps 7a, 7c, 7d server side).
 *
 * Mounted through `McpModule` (MCP tools are the first callers of
 * `ApprovalsService.request`), which keeps `app.module.ts` untouched.
 * Exports the service for approval-gated tools (MCP, REST v1) and the
 * kind registry so a work package can plug in the handler of a kind it
 * ships (WP-45, WP-30).
 *
 * Every route is dark exactly when the API-key surfaces are
 * (`ApiKeysFlagMiddleware`: `mcpServer` or `publicApi`, minus the
 * `MCP_DISABLED` switch).
 */
@Module({
  imports: [ApprovalsCoreModule, EnvelopesModule, GDriveModule],
  controllers: [ApprovalsController, ApprovalsEmailController],
  providers: [ApprovalsService, ApprovalKindRegistry, ApprovalCsrf, ApprovalRateLimiter],
  exports: [ApprovalsService, ApprovalKindRegistry],
})
export class ApprovalsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ApiKeysFlagMiddleware).forRoutes(ApprovalsController, ApprovalsEmailController);
  }
}
