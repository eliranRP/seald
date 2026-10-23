import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import { CimdFetcher } from './cimd';
import { ConnectedAppsService } from './connected-apps.service';
import { OAuthAccessTokenService } from './oauth-access-token.service';
import { OAuthAuthorizationService } from './oauth-authorization.service';
import { OAuthClientResolver } from './oauth-client-resolver';
import { buildMcpOAuthConfig, MCP_OAUTH_CONFIG } from './oauth-config';
import {
  ConnectedAppsController,
  OAuthConsentController,
  OAuthController,
  OAuthMetadataController,
} from './oauth.controller';
import { OAuthFlagMiddleware } from './oauth-flag.middleware';
import { OAuthRepository } from './oauth.repository';
import { OAuthPgRepository } from './oauth.repository.pg';
import { OAuthTokenService } from './oauth-token.service';

/**
 * MCP OAuth 2.1 (WP-27, decision D3): the authorization server, the
 * consent API, connected apps, and the access-token verifier
 * `McpAuthGuard` uses. Imported by `McpModule` (no `app.module.ts`
 * edit). `ApprovalsLifecycleService` comes from the global
 * `ApprovalsCoreModule`. Dark behind `mcpServer` + `mcpOauth`.
 */
@Module({
  controllers: [
    OAuthMetadataController,
    OAuthController,
    OAuthConsentController,
    ConnectedAppsController,
  ],
  providers: [
    {
      provide: MCP_OAUTH_CONFIG,
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => buildMcpOAuthConfig(env),
    },
    { provide: OAuthRepository, useClass: OAuthPgRepository },
    CimdFetcher,
    OAuthClientResolver,
    OAuthAuthorizationService,
    OAuthTokenService,
    OAuthAccessTokenService,
    ConnectedAppsService,
  ],
  exports: [OAuthAccessTokenService, MCP_OAUTH_CONFIG],
})
export class McpOAuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(OAuthFlagMiddleware)
      .forRoutes(
        OAuthMetadataController,
        OAuthController,
        OAuthConsentController,
        ConnectedAppsController,
      );
  }
}
