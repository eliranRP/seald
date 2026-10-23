import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from '@/lib/api/apiClient';
import { duplicateTemplateApi, restoreTemplate, type ApiTemplate } from '../templatesApi';

const POST = apiClient.post as unknown as ReturnType<typeof vi.fn>;

const API_TEMPLATE: ApiTemplate = {
  id: 'tpl-2',
  owner_id: 'o',
  title: 'NDA copy',
  description: null,
  cover_color: null,
  field_layout: [],
  tags: ['Legal'],
  last_signers: [],
  has_example_pdf: true,
  uses_count: 4,
  last_used_at: '2026-10-20T10:00:00.000Z',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

afterEach(() => vi.clearAllMocks());

describe('duplicateTemplateApi', () => {
  it('posts to /templates/:id/duplicate and returns the copy as a summary', async () => {
    POST.mockResolvedValue({ data: API_TEMPLATE });
    const copy = await duplicateTemplateApi('tpl 1');
    expect(POST).toHaveBeenCalledWith('/templates/tpl%201/duplicate', {}, {});
    expect(copy).toMatchObject({
      id: 'tpl-2',
      name: 'NDA copy',
      tags: ['Legal'],
      hasExamplePdf: true,
      uses: 4,
      lastUsedAt: '2026-10-20T10:00:00.000Z',
    });
  });
});

describe('restoreTemplate', () => {
  it('posts to /templates/:id/restore', async () => {
    POST.mockResolvedValue({ data: { ...API_TEMPLATE, last_used_at: null } });
    const t = await restoreTemplate('tpl-2');
    expect(POST).toHaveBeenCalledWith('/templates/tpl-2/restore', {}, {});
    expect(t.lastUsedAt).toBeNull();
  });
});
