import { Module, type Provider } from '@nestjs/common';
import { APP_ENV } from '../../../config/config.module';
import type { AppEnv } from '../../../config/env.schema';
import { StorageService } from '../../../storage/storage.service';
import { GDriveModule } from '../gdrive.module';
import { GDriveService } from '../gdrive.service';
import { ConversionController } from './conversion.controller';
import { ConversionGateway } from './conversion.gateway';
import { makeDriveFetcher, makeGotenbergClient } from './conversion.adapters';
import {
  CONVERSION_ASSET_WRITER,
  CONVERSION_MAX_BYTES,
  ConversionService,
  DRIVE_FETCHER,
  GOTENBERG_CLIENT,
  type ConversionAssetWriter,
  type DriveFetcher,
  type GotenbergClient,
} from './conversion.service';

const DriveFetcherProvider: Provider = {
  provide: DRIVE_FETCHER,
  useFactory: (): DriveFetcher => makeDriveFetcher(),
};

const GotenbergClientProvider: Provider = {
  provide: GOTENBERG_CLIENT,
  inject: [APP_ENV],
  useFactory: (env: AppEnv): GotenbergClient => makeGotenbergClient(env.GDRIVE_GOTENBERG_URL),
};

const ConversionMaxBytesProvider: Provider = {
  provide: CONVERSION_MAX_BYTES,
  inject: [APP_ENV],
  useFactory: (env: AppEnv): number => env.GDRIVE_CONVERSION_MAX_BYTES,
};

/**
 * Default asset writer: drops the converted PDF into Supabase Storage
 * under `gdrive-conversions/<userId>/<jobId>.pdf` and returns a 60-min
 * signed URL. The SPA picks the URL up via the GET /:jobId poll and
 * either streams it into the existing /place flow or attaches it to a
 * draft envelope.
 */
const ConversionAssetWriterProvider: Provider = {
  provide: CONVERSION_ASSET_WRITER,
  inject: [StorageService],
  useFactory: (storage: StorageService): ConversionAssetWriter => {
    return async ({ userId, jobId, bytes }): Promise<{ url: string }> => {
      const path = `gdrive-conversions/${userId}/${jobId}.pdf`;
      await storage.upload(path, bytes, 'application/pdf');
      const url = await storage.createSignedUrl(path, 60 * 60);
      return { url };
    };
  },
};

const ConversionServiceProvider: Provider = {
  provide: ConversionService,
  inject: [
    GDriveService,
    ConversionGateway,
    DRIVE_FETCHER,
    GOTENBERG_CLIENT,
    CONVERSION_MAX_BYTES,
    CONVERSION_ASSET_WRITER,
  ],
  useFactory: (
    drive: GDriveService,
    gateway: ConversionGateway,
    fetcher: DriveFetcher,
    gotenberg: GotenbergClient,
    maxBytes: number,
    writer: ConversionAssetWriter,
  ): ConversionService =>
    new ConversionService(drive, gateway, fetcher, gotenberg, maxBytes, writer),
};

/**
 * Conversion sub-module. Imports {@link GDriveModule} (NOT a duplicate
 * provider list — re-binding `GDriveService` would create a second
 * token cache and silently double our Google refresh footprint). The
 * rate limiter is re-bound here via the same factory provider so this
 * module can also stand on its own in unit tests.
 *
 * Phase 5 watchpoint #3 honored: cancellation is AbortSignal-driven via
 * {@link ConversionGateway}; no `gdrive_conversion_jobs` table.
 */
@Module({
  imports: [GDriveModule],
  controllers: [ConversionController],
  providers: [
    ConversionGateway,
    DriveFetcherProvider,
    GotenbergClientProvider,
    ConversionMaxBytesProvider,
    ConversionAssetWriterProvider,
    ConversionServiceProvider,
    // GDriveRateLimiter comes from `imports: [GDriveModule]` (re-exported
    // there). Re-binding it here would double it and let a user bypass
    // /files rate limiting by hammering /conversion — DO NOT add a
    // GDriveRateLimiterFactoryProvider line.
  ],
  exports: [ConversionService, ConversionGateway],
})
export class ConversionModule {}
