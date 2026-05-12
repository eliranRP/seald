import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ENVELOPE_STATUSES, isFeatureEnabled } from 'shared';
import type { Envelope, EnvelopeGdriveSaveResult } from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { extractClientIp } from '../common/extract-client-ip';
import {
  DrivePermissionDeniedError,
  DriveUpstreamError,
  GDriveError,
  GdriveNotConnectedError,
  TokenExpiredError,
} from '../integrations/gdrive/dto/error-codes';
import { RateLimitedError } from '../integrations/gdrive/rate-limiter';
import { AddSignerDto } from './dto/add-signer.dto';
import { CreateEnvelopeDto } from './dto/create-envelope.dto';
import { PatchEnvelopeDto } from './dto/patch-envelope.dto';
import { PlaceFieldsDto } from './dto/place-fields.dto';
import { SaveToGdriveDto } from './dto/save-to-gdrive.dto';
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

  /**
   * Push the envelope's sealed PDF + audit-trail PDF into a Google Drive
   * folder the user picked via the Google Picker. Gated on the
   * `gdriveIntegration` feature flag (404 when off — no info leak, like
   * the rest of `/integrations/gdrive/*`).
   *
   * On a partial success (one of the two uploads landed, the other
   * failed) we return `207` with an `error` field in the body and the
   * file ids that succeeded. The export record is still updated so a
   * re-save retries only the failure.
   *
   * Error mapping (each surfaces a `{ code, message }` body the SPA
   * switches on):
   *   - `404 envelope_not_found` — not owned / missing
   *   - `409 envelope_not_sealed` — sealed + audit artifacts not present
   *   - `409 gdrive_not_connected` — no connected Drive account
   *   - `409 token-expired` — refresh token revoked → reconnect
   *   - `429 rate-limited` (+ `retryAfter`) — our bucket or Drive's 429
   *   - `403 permission-denied` — Drive refused the folder
   *   - `502 drive-upstream-error` — Drive 5xx / transport / unknown
   */
  @Post(':id/gdrive/save')
  async saveToGdrive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveToGdriveDto,
    @Res({ passthrough: true }) res: { status(code: number): void },
  ): Promise<EnvelopeGdriveSaveResult> {
    if (!isFeatureEnabled('gdriveIntegration')) {
      throw new NotFoundException('not_found');
    }
    try {
      const result = await this.svc.saveToGoogleDrive(user.id, id, {
        folderId: dto.folderId,
        folderName: dto.folderName ?? null,
      });
      if (result.error !== undefined) {
        // Partial success: one upload landed, the other didn't — 207.
        res.status(207);
      }
      return result;
    } catch (err) {
      throw mapGdriveSaveError(err);
    }
  }
}

/**
 * Map the errors that flow out of `EnvelopesService.saveToGoogleDrive`
 * onto HTTP exceptions. `NotFoundException` / `ConflictException` thrown
 * by the service (envelope not found / not sealed) pass straight through;
 * the gdrive-domain errors get the wireframe `{ code, message }` body.
 */
function mapGdriveSaveError(err: unknown): unknown {
  if (err instanceof HttpException) return err;
  if (err instanceof GdriveNotConnectedError) {
    return new HttpException(
      { code: 'gdrive-not-connected', message: 'gdrive_not_connected' },
      HttpStatus.CONFLICT,
    );
  }
  if (err instanceof TokenExpiredError) {
    return new HttpException(
      { code: 'token-expired', message: 'reconnect_required' },
      HttpStatus.CONFLICT,
    );
  }
  if (err instanceof RateLimitedError) {
    return new HttpException(
      {
        code: 'rate-limited',
        message: 'gdrive_rate_limited',
        retryAfter: Math.ceil(err.retryAfterMs / 1000),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (err instanceof DrivePermissionDeniedError) {
    return new HttpException(
      { code: 'permission-denied', message: 'folder_not_writable' },
      HttpStatus.FORBIDDEN,
    );
  }
  if (err instanceof DriveUpstreamError || err instanceof GDriveError) {
    return new HttpException(
      { code: 'drive-upstream-error', message: 'drive_request_failed' },
      HttpStatus.BAD_GATEWAY,
    );
  }
  // Unknown — opaque 502, body deliberately omits err.message.
  return new HttpException(
    { code: 'drive-upstream-error', message: 'drive_request_failed' },
    HttpStatus.BAD_GATEWAY,
  );
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
