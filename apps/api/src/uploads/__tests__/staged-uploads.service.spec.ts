import { InMemoryStorageService } from '../../../test/in-memory-storage';
import type { EnvelopeDocumentsService } from '../../envelopes/documents/envelope-documents.service';
import type { EnvelopesService } from '../../envelopes/envelopes.service';
import { decodeBase64Strict, detectStagedFileKind } from '../file-type';
import { StagedUploadsService, stagingKey } from '../staged-uploads.service';
import { InMemoryStagedUploadsRepository } from './in-memory-staged-uploads.repository';
import { pdfBytes } from '../../mcp/tools/__tests__/write-harness';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const NOW = new Date('2026-10-02T12:00:00.000Z');

function setup(gotenberg?: () => Promise<{ ok: boolean; status: number; body: Buffer }>) {
  const repo = new InMemoryStagedUploadsRepository();
  const storage = new InMemoryStorageService();
  const svc = new StagedUploadsService(
    repo,
    storage,
    {} as EnvelopesService,
    {} as EnvelopeDocumentsService,
    gotenberg,
  );
  return { repo, storage, svc };
}

describe('StagedUploadsService', () => {
  it('detects PDF and .docx from magic bytes only', async () => {
    expect(detectStagedFileKind(await pdfBytes())).toBe('pdf');
    expect(detectStagedFileKind(Buffer.from('PK\x03\x04 word/document.xml', 'latin1'))).toBe(
      'docx',
    );
    expect(detectStagedFileKind(Buffer.from('PK\x03\x04 xl/workbook.xml', 'latin1'))).toBeNull();
    expect(detectStagedFileKind(Buffer.from('GIF89a'))).toBeNull();
    expect(decodeBase64Strict('aGVsbG8=')?.toString()).toBe('hello');
    expect(decodeBase64Strict('a')).toBeNull();
    expect(decodeBase64Strict('***=')).toBeNull();
  });

  it('turns a converter timeout into conversion_timeout and a missing converter into conversion_unavailable', async () => {
    const docx = Buffer.from('PK\x03\x04 word/document.xml', 'latin1').toString('base64');
    const timeout = setup(async () => {
      const e = new Error('timed out');
      e.name = 'TimeoutError';
      throw e;
    });
    await expect(
      timeout.svc.stageInline(OWNER, { filename: 'a.docx', content_base64: docx }, NOW),
    ).rejects.toMatchObject({
      message: 'conversion_timeout',
    });
    const none = setup();
    await expect(
      none.svc.stageInline(OWNER, { filename: 'a.docx', content_base64: docx }, NOW),
    ).rejects.toMatchObject({
      message: 'conversion_unavailable',
    });
    expect(timeout.repo.rows.size + none.repo.rows.size).toBe(0);
  });

  it('sweeps expired, never-attached uploads and their objects; keeps attached and live ones', async () => {
    const { repo, storage, svc } = setup();
    const b64 = (await pdfBytes()).toString('base64');
    const old = await svc.stageInline(OWNER, { filename: 'a.pdf', content_base64: b64 }, NOW);
    const attached = await svc.stageInline(OWNER, { filename: 'b.pdf', content_base64: b64 }, NOW);
    const started = await svc.startUpload(OWNER, { filename: 'c.pdf' }, NOW);
    await repo.consume(OWNER, attached.document_id);
    const later = new Date(NOW.getTime() + 25 * 3600_000);
    const fresh = await svc.stageInline(OWNER, { filename: 'd.pdf', content_base64: b64 }, later);
    expect(await svc.sweepExpired(later)).toEqual({ deleted: 2, objects_failed: 0 });
    expect(repo.rows.has(old.document_id)).toBe(false);
    expect(repo.rows.has(started.upload_id)).toBe(false);
    expect(repo.rows.has(attached.document_id)).toBe(true);
    expect(repo.rows.has(fresh.document_id)).toBe(true);
    expect(await storage.exists(stagingKey(OWNER, old.document_id))).toBe(false);
    expect(await storage.exists(stagingKey(OWNER, fresh.document_id))).toBe(true);
  });

  it('purges every staging object of an owner on account deletion', async () => {
    const { storage, svc } = setup();
    const b64 = (await pdfBytes()).toString('base64');
    const a = await svc.stageInline(OWNER, { filename: 'a.pdf', content_base64: b64 }, NOW);
    expect(await svc.purgeOwner(OWNER)).toBe(1);
    expect(await storage.exists(stagingKey(OWNER, a.document_id))).toBe(false);
  });
});
