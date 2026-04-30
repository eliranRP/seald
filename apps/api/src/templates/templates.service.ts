import { Injectable, NotFoundException } from '@nestjs/common';
import type { Template } from 'shared';
import type { CreateTemplateDto } from './dto/create-template.dto';
import type { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesRepository, type UpdateTemplatePatch } from './templates.repository';

@Injectable()
export class TemplatesService {
  constructor(private readonly repo: TemplatesRepository) {}

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
}
