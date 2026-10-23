import type { GotenbergClient } from '../../integrations/gdrive/conversion/conversion.service';
import { pdfBytes } from '../../mcp/tools/__tests__/write-harness';
import { detectLocalUploadKind, LocalConvertService } from '../local-convert.service';

const DOCX = Buffer.from('PK\x03\x04 word/document.xml', 'latin1');
const DOC = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.from('legacy'),
]);
const CONVERTED = Buffer.from('%PDF-1.7 converted', 'latin1');

function svc(client?: GotenbergClient, max?: number): LocalConvertService {
  return new LocalConvertService(client, max);
}

describe('LocalConvertService', () => {
  it('detects pdf, docx and legacy doc from magic bytes', async () => {
    expect(detectLocalUploadKind(await pdfBytes())).toBe('pdf');
    expect(detectLocalUploadKind(DOCX)).toBe('docx');
    expect(detectLocalUploadKind(DOC)).toBe('doc');
    expect(detectLocalUploadKind(Buffer.from('GIF89a'))).toBeNull();
  });

  it('passes a PDF through without calling the converter', async () => {
    const client = jest.fn();
    const bytes = await pdfBytes();
    const out = await svc(client).toPdf(bytes);
    expect(out).toEqual({ pdf: bytes, converted: false });
    expect(client).not.toHaveBeenCalled();
  });

  it('converts docx and doc through Gotenberg', async () => {
    const client = jest.fn(async () => ({ ok: true, status: 200, body: CONVERTED }));
    const a = await svc(client).toPdf(DOCX);
    const b = await svc(client).toPdf(DOC);
    expect(a).toEqual({ pdf: CONVERTED, converted: true });
    expect(b.converted).toBe(true);
    expect(client).toHaveBeenCalledTimes(2);
  });

  it('maps unsupported types to 415', async () => {
    await expect(svc().toPdf(Buffer.from('GIF89a'))).rejects.toMatchObject({
      message: 'unsupported_file_type',
      status: 415,
    });
  });

  it('maps oversized input and output to 413', async () => {
    await expect(svc(undefined, 4).toPdf(DOCX)).rejects.toMatchObject({
      message: 'file_too_large',
      status: 413,
    });
    const client: GotenbergClient = async () => ({ ok: true, status: 200, body: CONVERTED });
    await expect(svc(client, CONVERTED.length - 1).toPdf(DOCX)).rejects.toMatchObject({
      status: 413,
    });
  });

  it('maps converter failures to 502, timeouts to 504, a missing converter to 503', async () => {
    const bad: GotenbergClient = async () => ({ ok: false, status: 500, body: Buffer.alloc(0) });
    await expect(svc(bad).toPdf(DOCX)).rejects.toMatchObject({
      message: 'conversion_failed',
      status: 502,
    });
    const timeout: GotenbergClient = async () => {
      const e = new Error('t');
      e.name = 'TimeoutError';
      throw e;
    };
    await expect(svc(timeout).toPdf(DOCX)).rejects.toMatchObject({ status: 504 });
    await expect(svc().toPdf(DOCX)).rejects.toMatchObject({
      message: 'conversion_unavailable',
      status: 503,
    });
  });
});
