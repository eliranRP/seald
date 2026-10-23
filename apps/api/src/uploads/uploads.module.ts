import { Module } from '@nestjs/common';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { ConversionModule } from '../integrations/gdrive/conversion/conversion.module';
import { GDriveModule } from '../integrations/gdrive/gdrive.module';
import {
  DRIVE_FILE_METADATA_FETCHER,
  DriveSourceService,
  makeDriveFileMetadataFetcher,
} from './drive-source.service';
import { LocalConvertController } from './local-convert.controller';
import { LocalConvertService } from './local-convert.service';
import { StagedUploadsRepository } from './staged-uploads.repository';
import { StagedUploadsPgRepository } from './staged-uploads.repository.pg';
import { StagedUploadsService } from './staged-uploads.service';

/**
 * Staged uploads and Drive import for MCP (WP-19, steps 8b and 8d).
 * `StorageService` comes from the global StorageModule.
 */
@Module({
  imports: [EnvelopesModule, GDriveModule, ConversionModule],
  controllers: [LocalConvertController],
  providers: [
    LocalConvertService,
    StagedUploadsService,
    { provide: StagedUploadsRepository, useClass: StagedUploadsPgRepository },
    DriveSourceService,
    { provide: DRIVE_FILE_METADATA_FETCHER, useFactory: () => makeDriveFileMetadataFetcher() },
  ],
  exports: [StagedUploadsService, DriveSourceService],
})
export class UploadsModule {}
