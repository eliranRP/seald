import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
vi.mock('@/lib/api/apiClient', () => ({
  apiClient: { post: (...args: unknown[]) => post(...args) },
}));

import { ConvertUploadError, convertUploadToPdf, isWordFile, pdfNameFor } from './convertUpload';

const DOCX = new File(['x'], 'Q3 vendor agreement.docx', {
  type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});

describe('convertUpload', () => {
  beforeEach(() => post.mockReset());

  it('recognises Word files by MIME or extension', () => {
    expect(isWordFile(DOCX)).toBe(true);
    expect(isWordFile(new File(['x'], 'old.doc'))).toBe(true);
    expect(isWordFile(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).toBe(false);
  });

  it('renames to .pdf', () => {
    expect(pdfNameFor('Offer.docx')).toBe('Offer.pdf');
    expect(pdfNameFor('Offer')).toBe('Offer.pdf');
  });

  it('posts the file and returns a PDF File', async () => {
    post.mockResolvedValueOnce({ data: new Blob(['%PDF-1.7']) });
    const out = await convertUploadToPdf(DOCX);
    expect(post).toHaveBeenCalledWith(
      '/uploads/convert',
      expect.any(FormData),
      expect.objectContaining({ responseType: 'blob' }),
    );
    expect(out.name).toBe('Q3 vendor agreement.pdf');
    expect(out.type).toBe('application/pdf');
  });

  it.each([
    [415, 'type'],
    [413, 'size'],
    [502, 'failed'],
    [undefined, 'failed'],
  ])('maps status %s to %s', async (status, reason) => {
    post.mockRejectedValueOnce(Object.assign(new Error('x'), { status }));
    await expect(convertUploadToPdf(DOCX)).rejects.toMatchObject({
      reason,
      name: ConvertUploadError.name,
    });
  });
});
