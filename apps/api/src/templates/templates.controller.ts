import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { Template } from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesService } from './templates.service';

// 25 MB to match the SPA's drop-area copy. The service layer enforces
// this again on the raw buffer length so a misbehaving multer config
// or direct buffer write can't slip a larger blob through.
const EXAMPLE_PDF_MAX_BYTES = 25 * 1024 * 1024;

// AuthGuard is registered globally as APP_GUARD in AuthModule — every
// route here authenticates by default.
@Controller('templates')
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ReadonlyArray<Template>> {
    return this.svc.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto): Promise<Template> {
    return this.svc.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Template> {
    return this.svc.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<Template> {
    return this.svc.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.svc.remove(user.id, id);
  }

  /**
   * Bumps `uses_count` and `last_used_at`. Called by the upload-flow
   * integration when a sender clicks "Continue with this template" on
   * `/templates/:id/use`. Returns the updated record so the SPA can
   * reflect the new lastUsed timestamp without a follow-up GET.
   */
  @Post(':id/use')
  @HttpCode(200)
  use(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Template> {
    return this.svc.use(user.id, id);
  }

  /**
   * Upload the sender's example PDF for this template. The bytes are
   * stored in Supabase Storage (under `templates/<owner>/<id>/…`) and
   * the relative path is persisted on the row. Re-upload overwrites
   * in place. Returns the updated template so the SPA can flip its
   * `has_example_pdf` flag without a follow-up GET.
   */
  @Post(':id/example')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: EXAMPLE_PDF_MAX_BYTES },
    }),
  )
  uploadExample(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<Template> {
    return this.svc.attachExamplePdf(user.id, id, file?.buffer, file?.mimetype);
  }

  /**
   * Stream the previously-uploaded example PDF back to the SPA so the
   * use-template editor can render the original document. 404 when no
   * PDF was attached. The storage path itself never leaves the server
   * — clients always go through this route.
   */
  @Get(':id/example')
  @Header('Content-Type', 'application/pdf')
  async downloadExample(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.svc.readExamplePdf(user.id, id);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.end(buf);
  }
}
