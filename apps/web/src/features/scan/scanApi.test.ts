import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScanSession,
  getPhoneScanSession,
  getScanSession,
  postScanPdf,
  scanPhoneUrl,
  takeScanPdf,
} from './scanApi';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api/apiClient', () => ({ apiClient: client }));

beforeEach(() => {
  client.get.mockReset();
  client.post.mockReset();
});

describe('scanApi', () => {
  it('builds the phone URL from the origin and code', () => {
    expect(scanPhoneUrl('abc_DEF-1', 'https://seald.test')).toBe(
      'https://seald.test/scan/abc_DEF-1',
    );
  });

  it('creates a session', async () => {
    client.post.mockResolvedValue({ data: { code: 'c', expires_at: 'x' } });
    await expect(createScanSession()).resolves.toEqual({ code: 'c', expires_at: 'x' });
    expect(client.post).toHaveBeenCalledWith('/scan-sessions', {}, {});
  });

  it('polls the owner status and the phone status on their own routes', async () => {
    client.get.mockResolvedValue({ data: { status: 'pending' } });
    await getScanSession('c1');
    await getPhoneScanSession('c1');
    expect(client.get).toHaveBeenNthCalledWith(1, '/scan-sessions/c1', {});
    expect(client.get).toHaveBeenNthCalledWith(2, '/scan-sessions/c1/phone', {});
  });

  it('takes the PDF as a File', async () => {
    client.get.mockResolvedValue({ data: new Blob(['%PDF']) });
    const file = await takeScanPdf('c1');
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('application/pdf');
    expect(client.get).toHaveBeenCalledWith('/scan-sessions/c1/pdf', { responseType: 'blob' });
  });

  it('posts the PDF as multipart under "file"', async () => {
    client.post.mockResolvedValue({ data: { page_count: 2 } });
    const pdf = new File(['%PDF'], 'Scan.pdf', { type: 'application/pdf' });
    await expect(postScanPdf('c1', pdf)).resolves.toEqual({ page_count: 2 });
    const [url, body, config] = client.post.mock.calls[0] as [
      string,
      FormData,
      { headers: object },
    ];
    expect(url).toBe('/scan-sessions/c1/pdf');
    expect(body.get('file')).toBeInstanceOf(File);
    expect(config.headers).toMatchObject({ 'Content-Type': 'multipart/form-data' });
  });
});
