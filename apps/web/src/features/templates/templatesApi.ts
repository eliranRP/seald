import type { AxiosRequestConfig } from 'axios';
import { apiClient } from '@/lib/api/apiClient';
import type { TemplateFieldLayout as TemplateField, TemplateSummary } from './templates';

/**
 * Wire shape the Nest `TemplatesController` returns for a single
 * template. Mirrors `apps/api/src/templates/templates.controller.ts`
 * + `packages/shared/src/templates.ts`. The DB stores the field
 * layout as `field_layout`; the UI domain calls it `fields`.
 */
export interface ApiTemplateLastSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

export interface ApiTemplate {
  readonly id: string;
  readonly owner_id: string;
  readonly title: string;
  readonly description: string | null;
  readonly cover_color: string | null;
  readonly field_layout: ReadonlyArray<TemplateField>;
  readonly tags: ReadonlyArray<string>;
  readonly last_signers: ReadonlyArray<ApiTemplateLastSigner>;
  readonly uses_count: number;
  readonly last_used_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * Derive a sensible "pages" count for the templates list from the
 * stored field_layout. The server doesn't track an authored page
 * count, so we infer it as the largest numeric pageRule in the
 * layout (defaults to 1 if every rule is symbolic — `'all'`,
 * `'first'`, `'last'`, `'allButLast'` — since those rules expand
 * across whatever the target document is).
 */
function inferPagesFromLayout(fields: ReadonlyArray<TemplateField>): number {
  let max = 1;
  for (const f of fields) {
    if (typeof f.pageRule === 'number' && f.pageRule > max) {
      max = f.pageRule;
    }
  }
  return max;
}

function toSummary(t: ApiTemplate): TemplateSummary {
  return {
    id: t.id,
    name: t.title,
    description: t.description ?? '',
    pages: inferPagesFromLayout(t.field_layout),
    fieldCount: t.field_layout.length,
    lastUsed: t.last_used_at ? new Date(t.last_used_at).toLocaleDateString() : '—',
    uses: t.uses_count,
    cover: t.cover_color ?? '#EEF2FF',
    exampleFile: '',
    fields: t.field_layout,
    tags: t.tags ?? [],
    lastSigners: t.last_signers ?? [],
  };
}

function configWithSignal(signal?: AbortSignal): AxiosRequestConfig {
  return signal ? { signal } : {};
}

export async function listTemplates(signal?: AbortSignal): Promise<ReadonlyArray<TemplateSummary>> {
  const { data } = await apiClient.get<ReadonlyArray<ApiTemplate>>(
    '/templates',
    configWithSignal(signal),
  );
  return data.map(toSummary);
}

export interface CreateTemplateInput {
  readonly title: string;
  readonly description?: string | undefined;
  readonly cover_color?: string | undefined;
  readonly field_layout: ReadonlyArray<TemplateField>;
  readonly tags?: ReadonlyArray<string>;
  readonly last_signers?: ReadonlyArray<ApiTemplateLastSigner>;
}

export async function createTemplate(
  input: CreateTemplateInput,
  signal?: AbortSignal,
): Promise<TemplateSummary> {
  const body: Record<string, unknown> = {
    title: input.title,
    field_layout: input.field_layout,
  };
  if (input.description !== undefined) body['description'] = input.description;
  if (input.cover_color !== undefined) body['cover_color'] = input.cover_color;
  if (input.tags !== undefined) body['tags'] = input.tags;
  if (input.last_signers !== undefined) body['last_signers'] = input.last_signers;
  const { data } = await apiClient.post<ApiTemplate>('/templates', body, configWithSignal(signal));
  return toSummary(data);
}

export interface UpdateTemplateInput {
  readonly title?: string;
  readonly description?: string | undefined;
  readonly cover_color?: string | undefined;
  readonly field_layout?: ReadonlyArray<TemplateField>;
  readonly tags?: ReadonlyArray<string>;
  readonly last_signers?: ReadonlyArray<ApiTemplateLastSigner>;
}

export async function updateTemplate(
  id: string,
  patch: UpdateTemplateInput,
  signal?: AbortSignal,
): Promise<TemplateSummary> {
  const { data } = await apiClient.patch<ApiTemplate>(
    `/templates/${encodeURIComponent(id)}`,
    patch,
    configWithSignal(signal),
  );
  return toSummary(data);
}

export async function deleteTemplate(id: string, signal?: AbortSignal): Promise<void> {
  await apiClient.delete(`/templates/${encodeURIComponent(id)}`, configWithSignal(signal));
}

export async function bumpUseCount(id: string, signal?: AbortSignal): Promise<TemplateSummary> {
  const { data } = await apiClient.post<ApiTemplate>(
    `/templates/${encodeURIComponent(id)}/use`,
    {},
    configWithSignal(signal),
  );
  return toSummary(data);
}
