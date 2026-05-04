import { Module, Logger, type Provider } from '@nestjs/common';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import { AuthModule } from '../../auth/auth.module';
import {
  GDriveController,
  GDRIVE_CONFIG,
  GDRIVE_FILES_PROXY,
  type GDriveConfig,
  type FilesProxy,
} from './gdrive.controller';
import { GDriveService, GOOGLE_OAUTH_CLIENT } from './gdrive.service';
import { GDriveKmsService } from './gdrive-kms.service';
import { GDRIVE_REPOSITORY } from './gdrive.repository';
import { GDrivePgRepository } from './gdrive.repository.pg';
import { OAuthStateStore } from './oauth-pkce';
import { FetchGoogleOAuthClient } from './google-oauth.client';
import { GDriveRateLimiter } from './rate-limiter';
import { makeFilesProxy } from './files-proxy';

export { GDRIVE_FILES_PROXY };

/**
 * Token-bucket capacity + window defaults. Phase 1 Q9 mandated 30 req /
 * 60 s per user; the env vars (`GDRIVE_API_RATE_PER_USER`,
 * `GDRIVE_API_RATE_WINDOW_SECONDS`) override on a per-deploy basis.
 */
const DEFAULT_RATE_CAPACITY = 30;
const DEFAULT_RATE_WINDOW_SECONDS = 60;

/**
 * Exported standalone so the module spec can compile a minimal test
 * module without dragging in the full `AuthModule` + DB stack.
 */
export const GDriveRateLimiterFactoryProvider: Provider = {
  provide: GDriveRateLimiter,
  inject: [APP_ENV],
  useFactory: (env: AppEnv): GDriveRateLimiter => {
    const capacity = env.GDRIVE_API_RATE_PER_USER ?? DEFAULT_RATE_CAPACITY;
    const windowSeconds = env.GDRIVE_API_RATE_WINDOW_SECONDS ?? DEFAULT_RATE_WINDOW_SECONDS;
    return new GDriveRateLimiter({
      capacity,
      windowMs: windowSeconds * 1000,
    });
  },
};

const GDriveFilesProxyProvider: Provider = {
  provide: GDRIVE_FILES_PROXY,
  useFactory: (): FilesProxy => makeFilesProxy(),
};

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
    GDriveRateLimiterFactoryProvider,
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
        pickerDeveloperKey: env.GDRIVE_PICKER_DEVELOPER_KEY ?? '',
        pickerAppId: env.GDRIVE_PICKER_APP_ID ?? '',
      }),
    },
    GDriveFilesProxyProvider,
  ],
  exports: [GDriveService, GDriveRateLimiter],
})
export class GDriveModule {}

async function stubFail(): Promise<never> {
  throw new Error('gdrive_kms_misconfigured');
}
