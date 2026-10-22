import {
  BadRequestException,
  type CanActivate,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { EnvelopeDocument, EnvelopeDocumentListResponse } from 'shared';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { requireFlag } from '../../common/feature-flag.guard';
import { ReorderDocumentsDto } from './dto/reorder-documents.dto';
import { EnvelopeDocumentsService, titleFromFilename } from './envelope-documents.service';

/**
 * Runs before pipes and the multipart interceptor, so a dark route never
 * parses an upload or answers 400 on a bad id: it is a plain 404.
 */
class MultiDocumentFlagGuard implements CanActivate {
  canActivate(): boolean {
    requireFlag('multiDocumentEnvelopes');
    return true;
  }
}

/**
 * WP-03 — documents of a draft envelope. Every route 404s while the
 * `multiDocumentEnvelopes` flag is off, like a route that does not exist.
 * Thin adapter over EnvelopeDocumentsService (MCP-first rule 2).
 */
@Controller('envelopes')
@UseGuards(MultiDocumentFlagGuard)
export class EnvelopeDocumentsController {
  constructor(private readonly svc: EnvelopeDocumentsService) {}

  @Get(':id/documents')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EnvelopeDocumentListResponse> {
    return { documents: await this.svc.list(user.id, id) };
  }

  /**
   * Multipart `file` (PDF, 25 MB cap enforced by the service with
   * `file_too_large`) plus an optional `title` text field. Up to
   * MAX_ENVELOPE_DOCUMENTS per envelope.
   */
  @Post(':id/documents')
  @UseInterceptors(
    FileInterceptor('file', {
      // Same headroom as POST /envelopes/:id/upload.
      limits: { fileSize: 30 * 1024 * 1024, files: 1, fields: 1 },
    }),
  )
  async add(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { title?: unknown } = {},
  ): Promise<EnvelopeDocument> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('file_required');
    }
    let title: string | null = null;
    if (body.title !== undefined) {
      if (typeof body.title !== 'string') throw new BadRequestException('validation_error');
      const trimmed = body.title.trim();
      if (trimmed.length < 1 || trimmed.length > 200) {
        throw new BadRequestException('validation_error');
      }
      title = trimmed;
    }
    return this.svc.add(user.id, id, file.buffer, title ?? titleFromFilename(file.originalname));
  }

  @Put(':id/documents/order')
  async reorder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderDocumentsDto,
  ): Promise<EnvelopeDocumentListResponse> {
    return { documents: await this.svc.reorder(user.id, id, dto.document_ids) };
  }

  @Delete(':id/documents/:document_id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('document_id', ParseUUIDPipe) document_id: string,
  ): Promise<void> {
    await this.svc.remove(user.id, id, document_id);
  }
}
