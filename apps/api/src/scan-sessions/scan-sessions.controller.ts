import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import {
  SCAN_MAX_BYTES,
  type CreateScanSessionResponse,
  type ScanSessionPhoneView,
  type ScanSessionUploadResult,
  type ScanSessionView,
} from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { ScanSessionsService } from './scan-sessions.service';

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

/**
 * Scan with phone. Owner routes (create, status, take the PDF) use the
 * session; the two phone routes are `@Public()`: the code in the path is the
 * only credential, it reaches one session, and the PDF post works once.
 * Throttled per IP (the global throttler) on top of the per-owner cap of
 * open sessions.
 */
@Controller('scan-sessions')
export class ScanSessionsController {
  constructor(private readonly svc: ScanSessionsService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  create(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateScanSessionResponse> {
    noStore(res);
    return this.svc.create(user.id);
  }

  @Get(':code')
  @Throttle({ short: { limit: 60, ttl: 60_000 } })
  status(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ScanSessionView> {
    noStore(res);
    return this.svc.status(user.id, code);
  }

  @Get(':code/pdf')
  @Header('Content-Type', 'application/pdf')
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    noStore(res);
    const { pdf } = await this.svc.take(user.id, code);
    return new StreamableFile(pdf);
  }

  @Public()
  @Get(':code/phone')
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
  phone(
    @Param('code') code: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ScanSessionPhoneView> {
    noStore(res);
    return this.svc.phoneStatus(code);
  }

  @Public()
  @Post(':code/pdf')
  @HttpCode(201)
  @Throttle({ short: { limit: 6, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: SCAN_MAX_BYTES + 1, files: 1, fields: 0 } }),
  )
  async upload(
    @Param('code') code: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ScanSessionUploadResult> {
    noStore(res);
    if (!file || !file.buffer) throw new BadRequestException('file_required');
    return this.svc.receive(code, file.buffer);
  }
}
