import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ApiKeysFlagMiddleware } from '../api-keys/api-keys-flag.middleware';
import { AgentActivityController } from './agent-activity.controller';
import { AgentActivityRepository } from './agent-activity.repository';
import { AgentActivityPgRepository } from './agent-activity.repository.pg';
import { AgentActivityService } from './agent-activity.service';

/**
 * The owner's agent activity list (WP-26). Mounted through `McpModule`, so
 * `app.module.ts` stays untouched; dark exactly when the API-key surfaces
 * are (`ApiKeysFlagMiddleware`).
 */
@Module({
  controllers: [AgentActivityController],
  providers: [
    AgentActivityService,
    { provide: AgentActivityRepository, useClass: AgentActivityPgRepository },
  ],
  exports: [AgentActivityService],
})
export class AgentActivityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ApiKeysFlagMiddleware).forRoutes(AgentActivityController);
  }
}
