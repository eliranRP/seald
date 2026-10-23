import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BULK_SEND_MAX_FILE_BYTES, type BulkBatch, type BulkSchema } from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireFlag } from '../common/feature-flag.guard';
import { BulkService } from './bulk.service';

/**
 * Bulk send from a template (WP-36, flag `bulkSend`; 404 while it is off,
 * so a dark feature looks like a route that does not exist). AuthGuard is
 * global, so every route here authenticates by default and is owner scoped.
 */
@Controller()
export class BulkController {
  constructor(private readonly svc: BulkService) {}

  /** The CSV columns a template needs, and the limits. */
  @Get('templates/:id/bulk-schema')
  schema(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BulkSchema> {
    requireFlag('bulkSend');
    return this.svc.schema(user.id, id);
  }

  /**
   * Upload a CSV and get the preview: every row with its validation
   * errors. Nothing is sent until `confirm`. Multipart: `file` (the CSV)
   * plus optional text fields `expires_in_days`, `signing_order`,
   * `reminder_first_after_days`, `reminder_interval_days`, `reminder_max`.
   */
  @Post('templates/:id/bulk-batches')
  @UseInterceptors(
    FileInterceptor('file', {
      // Headroom over the real cap, which the service enforces with a slug.
      limits: { fileSize: BULK_SEND_MAX_FILE_BYTES * 2, files: 1, fields: 12 },
    }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, unknown> | undefined,
  ): Promise<BulkBatch> {
    requireFlag('bulkSend');
    return this.svc.createBatch(user, id, file, body ?? {});
  }

  @Get('bulk-batches/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<BulkBatch> {
    requireFlag('bulkSend');
    return this.svc.get(user.id, id);
  }

  /** Start sending the valid rows. Repeating it is harmless. */
  @Post('bulk-batches/:id/confirm')
  @HttpCode(200)
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BulkBatch> {
    requireFlag('bulkSend');
    return this.svc.confirm(user.id, id);
  }

  /** Stop the rows not sent yet. Envelopes already sent stay sent. */
  @Post('bulk-batches/:id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BulkBatch> {
    requireFlag('bulkSend');
    return this.svc.cancel(user.id, id);
  }
}
