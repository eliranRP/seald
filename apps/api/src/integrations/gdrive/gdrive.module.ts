import { Module, Logger } from '@nestjs/common';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import { AuthModule } from '../../auth/auth.module';
import { GDriveController, GDRIVE_CONFIG, type GDriveConfig } from './gdrive.controller';
import { GDriveService, GOOGLE_OAUTH_CLIENT } from './gdrive.service';
import { GDriveKmsService } from './gdrive-kms.service';
import { GDRIVE_REPOSITORY } from './gdrive.repository';
import { GDrivePgRepository } from './gdrive.repository.pg';
import { OAuthStateStore } from './oauth-pkce';
import { FetchGoogleOAuthClient } from './google-oauth.client';

/**
 * Drive integration module. All providers are factory-built from env so
 * the same image can run with the feature dark (no GDRIVE_* vars set —
 * controller throws NotFound on every route via the feature flag).
 *
 * Pre-merge security audit: `nodejs-security` skill — token storage path
 * (KMS envelope) + OAuth state store (CSRF resistance via single-use,
 * 10-min-TTL nonces).
 */
@Module({
  imports: [AuthModule],
  controllers: [GDriveController],
  providers: [
    GDriveService,
    { provide: GDRIVE_REPOSITORY, useClass: GDrivePgRepository },
    {
      provide: GDriveKmsService,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): GDriveKmsService => {
        const logger = new Logger('GDriveModule');
        if (!env.GDRIVE_TOKEN_KMS_KEY_ARN || !env.GDRIVE_TOKEN_KMS_REGION) {
          // Feature off / not yet provisioned. The controller's feature
          // flag guard 404s every route; this stub will never be called.
          logger.warn('GDriveKmsService: env not provisioned (feature off). Stub installed.');
          return new GDriveKmsService({ generateDataKey: stubFail, decrypt: stubFail }, 'stub');
        }
        return GDriveKmsService.fromEnv(env);
      },
    },
    OAuthStateStore,
    // GDriveRateLimiter provider deferred to WT-A-2 (lives with the
    // files-proxy route it gates). See decisions.md Phase 5 corrected
    // verdict — rate-limiter without its consumer would be an orphan
    // provider, tripping nestjs-best-practices.
    {
      provide: GOOGLE_OAUTH_CLIENT,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): FetchGoogleOAuthClient =>
        new FetchGoogleOAuthClient(
          env.GDRIVE_OAUTH_CLIENT_ID ?? 'unset',
          env.GDRIVE_OAUTH_CLIENT_SECRET ?? 'unset',
          env.GDRIVE_OAUTH_REDIRECT_URI ??
            'http://localhost:3000/integrations/gdrive/oauth/callback',
        ),
    },
    {
      provide: GDRIVE_CONFIG,
      inject: [APP_ENV],
      useFactory: (env: AppEnv): GDriveConfig => ({
        clientId: env.GDRIVE_OAUTH_CLIENT_ID ?? '',
        clientSecret: env.GDRIVE_OAUTH_CLIENT_SECRET ?? '',
        redirectUri:
          env.GDRIVE_OAUTH_REDIRECT_URI ??
          'http://localhost:3000/integrations/gdrive/oauth/callback',
        appPublicUrl: env.APP_PUBLIC_URL,
      }),
    },
    // GDRIVE_FILES_PROXY provider deferred to WT-A-2 alongside the
    // GET /files route + rate-limiter; the route stub returns 501 in
    // this PR.
  ],
  exports: [GDriveService],
})
export class GDriveModule {}

async function stubFail(): Promise<never> {
  throw new Error('gdrive_kms_misconfigured');
}
