import { Injectable, NotFoundException } from '@nestjs/common';
import { expandTemplateFields, type ResolvedTemplateField } from 'shared';
import { TemplatesRepository } from './templates.repository';

export interface TemplateApplyResult {
  readonly template_id: string;
  readonly total_pages: number;
  readonly fields: ReadonlyArray<ResolvedTemplateField>;
}

/**
 * Applies a saved template layout to a document of a known page count:
 * expands `pageRule` (`all` / `allButLast` / `first` / `last` / N) into
 * concrete per-page fields. This used to run in the browser; it lives in
 * the API so the SPA and the MCP server get identical results. Owner
 * scoped: a template that is not the caller's is `template_not_found`.
 */
@Injectable()
export class TemplateApplyService {
  constructor(private readonly repo: TemplatesRepository) {}

  async apply(
    ownerId: string,
    templateId: string,
    totalPages: number,
  ): Promise<TemplateApplyResult> {
    const template = await this.repo.findOneByOwner(ownerId, templateId);
    if (!template) throw new NotFoundException('template_not_found');
    return {
      template_id: template.id,
      total_pages: totalPages,
      // `last_signers` backfills `signerRoleId` for legacy layouts that
      // only stored `signerIndex`.
      fields: expandTemplateFields(template.field_layout, totalPages, template.last_signers),
    };
  }
}
