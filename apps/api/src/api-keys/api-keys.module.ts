import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApiKeyAuthService } from './api-key-auth.service';
import { ApiKeysFlagMiddleware } from './api-keys-flag.middleware';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysPgRepository } from './api-keys.repository.pg';
import { ApiKeysService } from './api-keys.service';

/**
 * API keys (WP-14). Mounted through `MeModule` because the routes live
 * under `/me` (keeps `app.module.ts`, a hot file, untouched). Exports
 * `ApiKeyAuthService` for the MCP guard (WP-17) and the REST v1 guard
 * (WP-35), and `ApiKeysService` for account deletion.
 */
@Module({
  imports: [AuthModule],
  controllers: [ApiKeysController],
  providers: [
    ApiKeysService,
    ApiKeyAuthService,
    { provide: ApiKeysRepository, useClass: ApiKeysPgRepository },
  ],
  exports: [ApiKeysService, ApiKeyAuthService],
})
export class ApiKeysModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ApiKeysFlagMiddleware).forRoutes(ApiKeysController);
  }
}
