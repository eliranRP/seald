import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { ContactsModule } from '../contacts/contacts.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { EnvelopeQueriesModule } from '../envelopes/queries/envelope-queries.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { TemplatesModule } from '../templates/templates.module';
import { UploadsModule } from '../uploads/uploads.module';
import { McpAuthGuard, McpFlagGuard } from './mcp-auth.guard';
import { AutomationApprovalRegistrar } from './tools/automations/automation-approval.registrar';
import { McpController } from './mcp.controller';
import { McpServices } from './mcp-services';
import { McpOAuthModule } from './oauth/mcp-oauth.module';
import { McpToolRunner } from './tool-runner';

/**
 * MCP server (WP-17: transport and read tools, steps 4–6; WP-19: write
 * tools, steps 8a–8d). `SigningOrderService` comes from the global
 * SigningModule. Dark behind
 * `mcpServer` and the `MCP_DISABLED` switch. The only place under
 * src/mcp allowed to wire other Nest modules.
 */
@Module({
  imports: [
    ApiKeysModule,
    EnvelopesModule,
    EnvelopeQueriesModule,
    AccountsModule,
    IdempotencyModule,
    UploadsModule,
    // WP-21: owner approvals. Imported here, not in app.module.ts (a hot
    // file); its controllers (`/approvals/*`) mount through this import.
    ApprovalsModule,
    // WP-25: contacts and templates services.
    ContactsModule,
    TemplatesModule,
    // WP-27: OAuth 2.1 authorization server + access-token verifier,
    // dark behind `mcpOauth`; mounted here, not in app.module.ts.
    McpOAuthModule,
  ],
  controllers: [McpController],
  // WP-35: the public REST API (`src/public-api`) runs the same tools.
  exports: [McpToolRunner],
  providers: [
    McpFlagGuard,
    McpAuthGuard,
    McpServices,
    McpToolRunner,
    // WP-30: registers the automations approval kind's real handler.
    AutomationApprovalRegistrar,
  ],
})
export class McpModule {}
