import {
  BadRequestException,
  Controller,
  Header,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LocalConvertService } from './local-convert.service';

/**
 * `POST /uploads/convert`: the upload screen sends a PDF or Word file and
 * gets PDF bytes back, so the editor always works on a PDF.
 */
@Controller('uploads')
export class LocalConvertController {
  constructor(private readonly svc: LocalConvertService) {}

  @Post('convert')
  @Header('Content-Type', 'application/pdf')
  @UseInterceptors(
    // Middleware cap leaves headroom; the service enforces the real limit
    // with a `file_too_large` slug (413).
    FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024, files: 1, fields: 0 } }),
  )
  async convert(@UploadedFile() file: Express.Multer.File | undefined): Promise<StreamableFile> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('file_required');
    }
    const { pdf } = await this.svc.toPdf(file.buffer);
    return new StreamableFile(pdf);
  }
}
