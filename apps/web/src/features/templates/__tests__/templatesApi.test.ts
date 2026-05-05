import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { apiClient } from '@/lib/api/apiClient';
// eslint-disable-next-line import/first
import {
  fetchTemplateExamplePdf,
  uploadTemplateExamplePdf,
  type ApiTemplate,
} from '../templatesApi';

const POST = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const GET = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const SAMPLE_API_TEMPLATE: ApiTemplate = {
  id: 'tpl-1',
  owner_id: 'owner-1',
  title: 'NDA',
  description: null,
  cover_color: '#EEF',
  field_layout: [],
  tags: [],
  last_signers: [],
  has_example_pdf: true,
  uses_count: 0,
  last_used_at: null,
  created_at: '2026-04-30T00:00:00.000Z',
  updated_at: '2026-04-30T00:00:00.000Z',
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('uploadTemplateExamplePdf', () => {
  it('posts a multipart body to /templates/:id/example with the file under the `file` field', async () => {
    POST.mockResolvedValue({ data: SAMPLE_API_TEMPLATE });
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'sample.pdf', {
      type: 'application/pdf',
    });

    const summary = await uploadTemplateExamplePdf('tpl-1', file);

    expect(POST).toHaveBeenCalledTimes(1);
    const [url, body, config] = POST.mock.calls[0]!;
    expect(url).toBe('/templates/tpl-1/example');
    expect(body).toBeInstanceOf(FormData);
    const fd = body as FormData;
    const sent = fd.get('file');
    expect(sent).toBeInstanceOf(File);
    expect((sent as File).name).toBe('sample.pdf');
    expect((sent as File).type).toBe('application/pdf');
    // The Content-Type override (`undefined`) is the *intended* behavior —
    // axios + browser fill in the multipart boundary. Asserting it here
    // protects against a regression that would silently strip the
    // boundary and break the upload.
    const headers = (config as { headers?: Record<string, unknown> } | undefined)?.headers;
    expect(headers?.['Content-Type']).toBeUndefined();
    // The mapped TemplateSummary surfaces the projected boolean.
    expect(summary.hasExamplePdf).toBe(true);
    expect(summary.id).toBe('tpl-1');
  });

  it('URL-encodes the template id so colons / slashes survive the request', async () => {
    POST.mockResolvedValue({ data: SAMPLE_API_TEMPLATE });
    const file = new File([new Uint8Array()], 'x.pdf', { type: 'application/pdf' });
    await uploadTemplateExamplePdf('tpl with spaces', file);
    const [url] = POST.mock.calls[0]!;
    expect(url).toBe('/templates/tpl%20with%20spaces/example');
  });
});

describe('fetchTemplateExamplePdf', () => {
  it('GETs the example endpoint with responseType: blob and returns the body', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
    GET.mockResolvedValue({ data: blob });
    const out = await fetchTemplateExamplePdf('tpl-1');
    expect(GET).toHaveBeenCalledTimes(1);
    const [url, config] = GET.mock.calls[0]!;
    expect(url).toBe('/templates/tpl-1/example');
    expect((config as { responseType?: string }).responseType).toBe('blob');
    expect(out).toBe(blob);
  });

  it('rejects when axios rejects (e.g. 404 — no example PDF attached)', async () => {
    const err = new Error('Request failed with status code 404');
    GET.mockRejectedValue(err);
    await expect(fetchTemplateExamplePdf('tpl-missing')).rejects.toThrow(/404/);
  });
});
