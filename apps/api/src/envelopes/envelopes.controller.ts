import {
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
  UseGuards,
} from '@nestjs/common';
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
