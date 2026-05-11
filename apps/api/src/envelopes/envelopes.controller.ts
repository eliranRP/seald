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
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ENVELOPE_STATUSES } from 'shared';
import type { Envelope } from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { extractClientIp } from '../common/extract-client-ip';
import { AddSignerDto } from './dto/add-signer.dto';
import { CreateEnvelopeDto } from './dto/create-envelope.dto';
import { PatchEnvelopeDto } from './dto/patch-envelope.dto';
import { PlaceFieldsDto } from './dto/place-fields.dto';
import { SendEnvelopeDto } from './dto/send-envelope.dto';
import type {
  EnvelopeEvent,
  EnvelopeField,
  EnvelopeSigner,
  ListResult,
} from './envelopes.repository';
import { EnvelopesService } from './envelopes.service';

type EnvelopeStatus = Envelope['status'];

// AuthGuard is registered globally as APP_GUARD in AuthModule (rule 5.1).
// Every route here authenticates by default unless tagged with `@Public()`.
@Controller('envelopes')
export class EnvelopesController {
  constructor(private readonly svc: EnvelopesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEnvelopeDto,
    @Req() req: Request,
  ): Promise<Envelope> {
    return this.svc.createDraft(user.id, dto, {
      ip: extractClientIp(req),
      user_agent: req.headers['user-agent'] ?? null,
    });
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') statusQuery?: string,
    @Query('limit') limitQuery?: string,
    @Query('cursor') cursor?: string,
    @Query('sort') sort?: string,
    @Query('dir') dir?: string,
    @Query('q') q?: string,
    @Query('bucket') bucket?: string,
    @Query('date') date?: string,
    @Query('signer') signer?: string,
    @Query('tags') tags?: string,
  ): Promise<ListResult> {
    const statuses = parseStatuses(statusQuery);
    const limit = limitQuery ? Number.parseInt(limitQuery, 10) : undefined;
    return this.svc.list(user.id, {
      ...(statuses ? { statuses } : {}),
      ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
      ...(cursor ? { cursor } : {}),
      ...(sort ? { sort } : {}),
      ...(dir ? { dir } : {}),
      ...(q ? { q } : {}),
      ...(bucket ? { bucket } : {}),
      ...(date ? { date } : {}),
      ...(signer ? { signer } : {}),
      ...(tags ? { tags } : {}),
      viewerEmail: user.email,
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
  send(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Body() dto: SendEnvelopeDto = {},
  ): Promise<Envelope> {
    // The sender's display identity is threaded into the invite email's
    // "From: <name>" line, so we need at least an email. JWT email always
    // wins (anti-spoofing — a signed-in user can't impersonate via body);
    // body sender_email is only consulted for anonymous Supabase sessions
    // (guest mode) where the JWT carries `email: null`.
    const sender_email = user.email ?? dto.sender_email ?? null;
    if (!sender_email) {
      throw new BadRequestException('sender_email_missing');
    }
    const sender_name = user.email ? null : (dto.sender_name ?? null);
    return this.svc.send(
      user.id,
      id,
      { email: sender_email, name: sender_name },
      { ip: extractClientIp(req), user_agent: req.headers['user-agent'] ?? null },
    );
  }

  /**
   * Sender-initiated cancel ("withdraw") of a sent envelope. Allowed only
   * on `awaiting_others` and `sealing` — terminal statuses surface as 409.
   * On success the envelope flips to `canceled`, pending access tokens are
   * revoked, and withdrawal emails fan out to every still-relevant signer.
   */
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<{ status: 'canceled'; envelope_status: 'canceled' }> {
    return this.svc.cancel(user.id, id, {
      ip: extractClientIp(req),
      user_agent: req.headers['user-agent'] ?? null,
    });
  }

  @Post(':id/signers/:signer_id/remind')
  @HttpCode(202)
  async remindSigner(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('signer_id', ParseUUIDPipe) signer_id: string,
    @Body() dto: SendEnvelopeDto = {},
  ): Promise<{ status: 'queued' }> {
    // Same JWT-email-wins resolution as POST /:id/send. Anonymous senders
    // (guest mode) include `sender_email` in the body so the reminder can
    // still go out under their identity.
    const sender_email = user.email ?? dto.sender_email ?? null;
    if (!sender_email) throw new BadRequestException('sender_email_missing');
    const sender_name = user.email ? null : (dto.sender_name ?? null);
    await this.svc.remindSigner(user.id, id, signer_id, {
      email: sender_email,
      name: sender_name,
    });
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
   * Short-lived signed URL for downloading an envelope artifact.
   *
   * `?kind=sealed|original|audit` picks which file. When the query is
   * omitted the service falls back to "sealed if available, else
   * original" — the sensible default for a generic "Download PDF" CTA.
   *
   * Clients redirect the browser to `url` (new tab or anchor click) to
   * trigger the download.
   */
  @Get(':id/download')
  download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('kind') kind?: string,
  ): Promise<{ url: string; kind: 'sealed' | 'original' | 'audit' }> {
    let resolved: 'sealed' | 'original' | 'audit' | undefined;
    if (kind === 'sealed' || kind === 'original' || kind === 'audit') {
      resolved = kind;
    } else if (kind !== undefined) {
      throw new BadRequestException('invalid_kind');
    }
    return this.svc.getDownloadUrl(user.id, id, resolved);
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
