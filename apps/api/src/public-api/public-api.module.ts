import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { McpModule } from '../mcp/mcp.module';
import { ApiKeyGuard } from './api-key.guard';
import { PublicApiController, PublicApiDocsController } from './public-api.controller';
import { PublicApiFlagGuard } from './public-api-flag';
import { PublicApiRateGuard, PublicApiRateLimiter } from './public-api-rate-limiter';

/**
 * Public REST API v1 (WP-35, parity plan D1), dark behind `publicApi`.
 * It reuses the MCP tool layer through `McpToolRunner` (exported by
 * `McpModule`), so it needs no service wiring of its own.
 */
@Module({
  imports: [ApiKeysModule, McpModule],
  controllers: [PublicApiController, PublicApiDocsController],
  providers: [ApiKeyGuard, PublicApiFlagGuard, PublicApiRateGuard, PublicApiRateLimiter],
})
export class PublicApiModule {}
