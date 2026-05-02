import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Template } from 'shared';
import { StorageService } from '../storage/storage.service';
import type { CreateTemplateDto } from './dto/create-template.dto';
import type { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesRepository, type UpdateTemplatePatch } from './templates.repository';

/**
 * Maximum example-PDF size accepted by `attachExamplePdf`. Same 25 MB
 * cap as the regular envelope upload (see `envelopes.controller`),
 * keeping the SPA's drop-area copy ("up to 25 MB") accurate across
 * both flows. Enforced server-side on the buffer length rather than
 * trusting `multer.limits` alone — the limit there only stops the
 * multipart parser, not a base64 / direct write.
 */
const MAX_EXAMPLE_PDF_BYTES = 25 * 1024 * 1024;
const PDF_MIME = 'application/pdf';
// `%PDF-` — same magic-byte gate as `EnvelopesService.uploadOriginal`.
// The client-supplied `mimetype` alone is spoofable (a GIF carrying
// `Content-Type: application/pdf` would otherwise pass), so we
// double-check the buffer header. Caught in the QA audit
// (qa/envelope-templates-break-tests).
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

@Injectable()
export class TemplatesService {
  constructor(
    private readonly repo: TemplatesRepository,
    private readonly storage: StorageService,
  ) {}

  list(owner_id: string): Promise<ReadonlyArray<Template>> {
    return this.repo.findAllByOwner(owner_id);
  }

  async get(owner_id: string, id: string): Promise<Template> {
    const t = await this.repo.findOneByOwner(owner_id, id);
    if (!t) throw new NotFoundException('template_not_found');
    return t;
  }

  create(owner_id: string, dto: CreateTemplateDto): Promise<Template> {
    return this.repo.create({
      owner_id,
      title: dto.title,
      description: dto.description ?? null,
      cover_color: dto.cover_color ?? null,
      field_layout: dto.field_layout,
      tags: dto.tags ?? [],
      last_signers: dto.last_signers ?? [],
    });
  }

  async update(owner_id: string, id: string, dto: UpdateTemplateDto): Promise<Template> {
    // Strip undefined keys (class-transformer may inject `field: undefined`
    // for absent optional fields). Forwarding undefined would cause the PG
    // adapter to update only `updated_at`. Follows the contacts.service
    // pattern.
    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    ) as UpdateTemplatePatch;
    const t = await this.repo.update(owner_id, id, patch);
    if (!t) throw new NotFoundException('template_not_found');
    return t;
  }

  async remove(owner_id: string, id: string): Promise<void> {
    const ok = await this.repo.delete(owner_id, id);
    if (!ok) throw new NotFoundException('template_not_found');
  }

  async use(owner_id: string, id: string): Promise<Template> {
    const t = await this.repo.incrementUseCount(owner_id, id);
    if (!t) throw new NotFoundException('template_not_found');
    return t;
  }

  /**
   * Validate + upload the sender's example PDF to Storage and persist
   * its path on the template row. Throws BadRequest for the obvious
   * client errors (missing buffer, wrong mime, >limit). Existing PDFs
   * for the same template are overwritten in-place via Storage's
   * `x-upsert: true`.
   */
  async attachExamplePdf(
    owner_id: string,
    id: string,
    body: Buffer | undefined,
    mimetype: string | undefined,
  ): Promise<Template> {
    if (!body || body.length === 0) {
      throw new BadRequestException('example_pdf_empty');
    }
    if (mimetype !== PDF_MIME) {
      throw new BadRequestException('example_pdf_wrong_type');
    }
    if (body.length > MAX_EXAMPLE_PDF_BYTES) {
      throw new BadRequestException('example_pdf_too_large');
    }
    // Magic-byte gate. Mirrors `EnvelopesService.uploadOriginal` so a
    // mis-declared mimetype (or a content-type-confusion payload like
    // a GIF with `application/pdf`) never reaches Storage.
    if (body.length < PDF_MAGIC.length || !body.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      throw new BadRequestException('example_pdf_wrong_type');
    }
    // Confirm ownership BEFORE writing to Storage so an unauthenticated
    // or wrong-tenant caller can't pollute the bucket with bytes for a
    // template they don't own.
    const t = await this.repo.findOneByOwner(owner_id, id);
    if (!t) throw new NotFoundException('template_not_found');
    // Stable key per template — re-upload overwrites in place.
    const path = `templates/${owner_id}/${id}/example.pdf`;
    await this.storage.upload(path, body, PDF_MIME);
    const updated = await this.repo.setExamplePdfPath(owner_id, id, path);
    if (!updated) throw new NotFoundException('template_not_found');
    return updated;
  }

  /**
   * Read the example-PDF bytes for a template the caller owns. Returns
   * 404 when the template is missing, owned by someone else, or has no
   * example PDF attached. The path itself never leaves the service.
   */
  async readExamplePdf(owner_id: string, id: string): Promise<Buffer> {
    const path = await this.repo.getExamplePdfPath(owner_id, id);
    if (!path) throw new NotFoundException('template_example_not_found');
    return this.storage.download(path);
  }
}
