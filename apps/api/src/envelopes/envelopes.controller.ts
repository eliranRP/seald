import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { ENVELOPE_STATUSES } from 'shared';
import type { Envelope } from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AddSignerDto } from './dto/add-signer.dto';
import { CreateEnvelopeDto } from './dto/create-envelope.dto';
import { PatchEnvelopeDto } from './dto/patch-envelope.dto';
import { PlaceFieldsDto } from './dto/place-fields.dto';
import type {
  EnvelopeEvent,
  EnvelopeField,
  EnvelopeSigner,
  ListResult,
} from './envelopes.repository';
import { EnvelopesService } from './envelopes.service';

type EnvelopeStatus = Envelope['status'];

@Controller('envelopes')
@UseGuards(AuthGuard)
export class EnvelopesController {
  constructor(private readonly svc: EnvelopesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEnvelopeDto): Promise<Envelope> {
    return this.svc.createDraft(user.id, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') statusQuery?: string,
    @Query('limit') limitQuery?: string,
    @Query('cursor') cursor?: string,
  ): Promise<ListResult> {
    const statuses = parseStatuses(statusQuery);
    const limit = limitQuery ? Number.parseInt(limitQuery, 10) : undefined;
    return this.svc.list(user.id, {
      ...(statuses ? { statuses } : {}),
      ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
      ...(cursor ? { cursor } : {}),
    });
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Envelope> {
    return this.svc.getById(user.id, id);
  }

  @Patch(':id')
  patch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchEnvelopeDto,
  ): Promise<Envelope> {
    return this.svc.patchDraft(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.svc.deleteDraft(user.id, id);
  }

  @Post(':id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      // 30 MB hard cap at the middleware layer — the service enforces the real
      // 25 MB limit with a proper `file_too_large` slug. This headroom keeps
      // the connection from being reset mid-upload for requests just over spec.
      limits: { fileSize: 30 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ pages: number; sha256: string }> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('file_required');
    }
    const envelope = await this.svc.uploadOriginal(user.id, id, file.buffer);
    return {
      pages: envelope.original_pages ?? 0,
      sha256: envelope.original_sha256 ?? '',
    };
  }

  @Post(':id/send')
  send(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Envelope> {
    if (!user.email) {
      // The sender's display identity is threaded into the invite email's
      // "From: <name>" line, so we need at least the email claim. Supabase
      // JWTs for Google OAuth always carry email; this guard is defensive.
      throw new BadRequestException('sender_email_missing');
    }
    return this.svc.send(user.id, id, { email: user.email });
  }

  @Post(':id/signers/:signer_id/remind')
  @HttpCode(202)
  async remindSigner(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('signer_id', ParseUUIDPipe) signer_id: string,
  ): Promise<{ status: 'queued' }> {
    if (!user.email) throw new BadRequestException('sender_email_missing');
    await this.svc.remindSigner(user.id, id, signer_id, { email: user.email });
    return { status: 'queued' };
  }

  @Post(':id/signers')
  addSigner(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSignerDto,
  ): Promise<EnvelopeSigner> {
    return this.svc.addSigner(user.id, id, dto);
  }

  @Delete(':id/signers/:signer_id')
  @HttpCode(204)
  removeSigner(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('signer_id', ParseUUIDPipe) signer_id: string,
  ): Promise<void> {
    return this.svc.removeSigner(user.id, id, signer_id);
  }

  @Put(':id/fields')
  placeFields(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlaceFieldsDto,
  ): Promise<{ fields: ReadonlyArray<EnvelopeField> }> {
    return this.svc
      .replaceFields(
        user.id,
        id,
        dto.fields.map((f) => ({
          signer_id: f.signer_id,
          kind: f.kind,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width ?? null,
          height: f.height ?? null,
          required: f.required ?? true,
          link_id: f.link_id ?? null,
        })),
      )
      .then((fields) => ({ fields }));
  }

  @Get(':id/events')
  events(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ events: ReadonlyArray<EnvelopeEvent> }> {
    return this.svc.listEvents(user.id, id).then((events) => ({ events }));
  }

  /**
   * Short-lived signed URL for downloading the envelope PDF. Returns the
   * sealed artifact once the envelope is complete, else the original
   * upload. Clients redirect the browser to `url` (e.g. via an invisible
   * anchor click) to trigger the download.
   */
  @Get(':id/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ url: string; kind: 'sealed' | 'original' }> {
    return this.svc.getDownloadUrl(user.id, id);
  }
}

const STATUS_SET = new Set<string>(ENVELOPE_STATUSES);

function parseStatuses(raw: string | undefined): EnvelopeStatus[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (parts.length === 0) return undefined;
  for (const p of parts) {
    if (!STATUS_SET.has(p)) {
      // Service layer re-validates and throws validation_error; returning the
      // raw list here keeps the controller thin.
      return parts as EnvelopeStatus[];
    }
  }
  return parts as EnvelopeStatus[];
}
