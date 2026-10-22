import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { EnvelopeQueriesModule } from '../envelopes/queries/envelope-queries.module';
import { McpAuthGuard, McpFlagGuard } from './mcp-auth.guard';
import { McpController } from './mcp.controller';
import { McpServices } from './mcp-services';
import { McpToolRunner } from './tool-runner';

/**
 * MCP server (WP-17: transport and read tools, steps 4–6). Dark behind
 * `mcpServer` and the `MCP_DISABLED` switch. The only place under
 * src/mcp allowed to wire other Nest modules.
 */
@Module({
  imports: [ApiKeysModule, EnvelopesModule, EnvelopeQueriesModule, AccountsModule],
  controllers: [McpController],
  providers: [McpFlagGuard, McpAuthGuard, McpServices, McpToolRunner],
})
export class McpModule {}
