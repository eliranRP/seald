import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { isFeatureEnabled } from 'shared';
import { CurrentUser } from '../../../auth/current-user.decorator';
import type { AuthUser } from '../../../auth/auth-user';
import { DriveImportService } from '../drive-import.service';
import { ConversionGateway } from './conversion.gateway';
import { mapConversionStartHttpError } from './conversion.http-errors';
import {
  ConversionStartRequest,
  type ConversionJobView,
  type ConversionStartResponse,
} from './dto/conversion.dto';

/**
 * Drive doc → PDF conversion routes. Three endpoints, all gated behind
 * `feature.gdriveIntegration` (NotFound when off — matches WT-A-1 leak
 * posture).
 *
 * Per `nodejs-security` review:
 *   - Rate limit shares the per-user token bucket with `/files`, so
 *     rotating accountIds cannot bypass the 30 req / 60 s ceiling.
 *     `DriveImportService` acquires that bucket.
 *   - Mime allow-list is checked in `DriveImportService` AND inside
 *     `ConversionService` (defence in depth).
 *   - Service errors are mapped through a tight switch; upstream messages
 *     are NOT echoed in the response body.
 *   - DELETE cancels via AbortController — both Drive `export` and
 *     Gotenberg fetch observe `signal`. Watchpoint #3 honored.
 */
@Controller('integrations/gdrive/conversion')
export class ConversionController {
  constructor(
    private readonly imports: DriveImportService,
    private readonly gateway: ConversionGateway,
  ) {}

  private requireFlag(): void {
    if (!isFeatureEnabled('gdriveIntegration')) {
      throw new NotFoundException('not_found');
    }
  }

  @Post()
  async start(
    @CurrentUser() user: AuthUser,
    @Body() body: ConversionStartRequest,
  ): Promise<ConversionStartResponse> {
    this.requireFlag();
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('body_required');
    }
    try {
      return await this.imports.start(user.id, {
        accountId: body.accountId,
        fileId: body.fileId,
        mimeType: body.mimeType,
      });
    } catch (err) {
      throw mapConversionStartHttpError(err);
    }
  }

  @Get(':jobId')
  async poll(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<ConversionJobView> {
    this.requireFlag();
    const view = this.gateway.view(jobId, user.id);
    if (!view) throw new NotFoundException('job_not_found');
    return view;
  }

  @Delete(':jobId')
  @HttpCode(204)
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<void> {
    this.requireFlag();
    const ok = this.gateway.cancel(jobId, user.id);
    if (!ok) throw new NotFoundException('job_not_found_or_terminal');
  }
}
