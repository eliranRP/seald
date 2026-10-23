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
import { FlaggedBodyPipe } from '../common/flagged-body.pipe';
import { EnvelopeDocumentsService } from './documents/envelope-documents.service';
import { AddSignerDto } from './dto/add-signer.dto';
import { CreateEnvelopeDto } from './dto/create-envelope.dto';
import { PatchEnvelopeDto } from './dto/patch-envelope.dto';
import { MultiDocumentPlaceFieldsDto, PlaceFieldsDto } from './dto/place-fields.dto';
import { ReplaceSignerDto, UpdateSignerDto } from './dto/update-signer.dto';
import { SaveToGdriveDto } from './dto/save-to-gdrive.dto';
import { SendEnvelopeDto } from './dto/send-envelope.dto';
import type { EnvelopeEvent, EnvelopeField, EnvelopeSigner } from './envelope.entity';
import { EnvelopesService, type EnvelopeDownloadKind, type ListResult } from './envelopes.service';
import { normalizeFieldPlacements } from './field-placement.service';
import { mapGdriveSaveError } from './gdrive-save-error.http-errors';
import { resolveSenderIdentity } from './sender-identity';

type EnvelopeStatus = Envelope['status'];

const MULTI_DOC = 'multiDocumentEnvelopes' as const;

// AuthGuard is registered globally as APP_GUARD in AuthModule (rule 5.1).
// Every route here authenticates by default unless tagged with `@Public()`.
@Controller('envelopes')
export class EnvelopesController {
  constructor(
    private readonly svc: EnvelopesService,
    private readonly documents: EnvelopeDocumentsService,
  ) {}

  /**
   * WP-03: with `multiDocumentEnvelopes` on, envelope responses carry
   * `documents[]` and each field's `document_id`. With it off they are
   * returned exactly as before.
   */
  private withDocuments(envelope: Envelope): Promise<Envelope> {
    return isFeatureEnabled(MULTI_DOC)
      ? this.documents.decorateEnvelope(envelope)
      : Promise.resolve(envelope);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEnvelopeDto,
    @Req() req: Request,
  ): Promise<Envelope> {
    const envelope = await this.svc.createDraft(user.id, dto, {
      ip: extractClientIp(req),
      user_agent: req.headers['user-agent'] ?? null,
    });
    return this.withDocuments(envelope);
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
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Envelope> {
    return this.withDocuments(await this.svc.getById(user.id, id));
  }

  @Patch(':id')
  async patch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PatchEnvelopeDto,
  ): Promise<Envelope> {
    return this.withDocuments(await this.svc.patchDraft(user.id, id, dto));
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
    // WP-03: replaces document 1 at its own storage path (a reorder can
    // have moved a non-legacy path into slot 1).
    const envelope = isFeatureEnabled(MULTI_DOC)
      ? await this.documents.replacePrimary(user.id, id, file.buffer)
      : await this.svc.uploadOriginal(user.id, id, file.buffer);
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
    // Not async: a missing sender email still throws synchronously, as before.
    return this.svc
      .send(user.id, id, resolveSenderIdentity(user, dto), {
        ip: extractClientIp(req),
        user_agent: req.headers['user-agent'] ?? null,
      })
      .then((envelope) => this.withDocuments(envelope));
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
    await this.svc.remindSigner(user.id, id, signer_id, resolveSenderIdentity(user, dto));
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

  /** Fix a signer's email (and optionally name) and re-invite them. Owner only. */
  @Patch(':id/signers/:signer_id')
  async updateSigner(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('signer_id', ParseUUIDPipe) signer_id: string,
    @Body() dto: UpdateSignerDto,
    @Req() req: Request,
  ): Promise<EnvelopeSigner> {
    const { signer } = await this.svc.fixSigner(user.id, id, signer_id, dto, {
      ip: extractClientIp(req),
      user_agent: req.headers['user-agent'] ?? null,
    });
    return signer;
  }

  /** Swap a signer who has not signed for someone else. Owner only. */
  @Post(':id/signers/:signer_id/replace')
  async replaceSigner(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('signer_id', ParseUUIDPipe) signer_id: string,
    @Body() dto: ReplaceSignerDto,
    @Req() req: Request,
  ): Promise<EnvelopeSigner> {
    const { signer } = await this.svc.replaceSigner(user.id, id, signer_id, dto, {
      ip: extractClientIp(req),
      user_agent: req.headers['user-agent'] ?? null,
    });
    return signer;
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

  /**
   * The body is validated by FlaggedBodyPipe, not the global pipe (hence
   * the `object` parameter type): with `multiDocumentEnvelopes` off it is
   * the legacy PlaceFieldsDto, so `document_id` is rejected exactly as
   * before; with it on, fields may name their document.
   */
  @Put(':id/fields')
  async placeFields(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new FlaggedBodyPipe(MULTI_DOC, MultiDocumentPlaceFieldsDto, PlaceFieldsDto))
    body: object,
  ): Promise<{ fields: ReadonlyArray<EnvelopeField> }> {
    const dto = body as MultiDocumentPlaceFieldsDto;
    const placements = normalizeFieldPlacements(dto.fields);
    if (!isFeatureEnabled(MULTI_DOC)) {
      return { fields: await this.svc.replaceFields(user.id, id, placements) };
    }
    const fields = await this.svc.replaceFields(user.id, id, placements, (input) =>
      this.documents.assertFieldDocuments(id, input),
    );
    return { fields: await this.documents.decorateFields(id, fields) };
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
   * `?kind=sealed|original|audit|declined` picks which file. When the query is
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
    @Query('document_id') documentId?: string,
  ): Promise<{ url: string; kind: EnvelopeDownloadKind | 'zip'; document_id?: string }> {
    // WP-03 (flag on): `?document_id=` picks one document's original or
    // sealed PDF, `?kind=zip` bundles every sealed document + audit.pdf.
    // With the flag off both are ignored, as unknown params always were.
    if (isFeatureEnabled(MULTI_DOC) && (documentId !== undefined || kind === 'zip')) {
      if (documentId !== undefined && !UUID_RE.test(documentId)) {
        throw new BadRequestException('validation_error');
      }
      if (kind !== undefined && kind !== 'original' && kind !== 'sealed' && kind !== 'zip') {
        throw new BadRequestException('invalid_kind');
      }
      return this.documents.downloadUrl(user.id, id, {
        ...(documentId !== undefined && kind !== 'zip' ? { document_id: documentId } : {}),
        ...(kind !== undefined ? { kind } : {}),
      });
    }
    let resolved: EnvelopeDownloadKind | undefined;
    if (kind === 'sealed' || kind === 'original' || kind === 'audit' || kind === 'declined') {
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

const STATUS_SET = new Set<string>(ENVELOPE_STATUSES);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
