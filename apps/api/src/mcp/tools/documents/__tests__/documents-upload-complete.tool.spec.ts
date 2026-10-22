import { MCP_UPLOAD_MAX_BYTES } from 'shared';
import {
  OTHER_OWNER,
  OWNER,
  callWrite,
  docxBytes,
  err,
  ok,
  pdfBytes,
  resetFlags,
  setFlags,
  write,
  writeWorld,
  type WriteWorld,
} from '../../__tests__/write-harness';

async function start(w: WriteWorld): Promise<{ id: string; key: string }> {
  const out = ok(await callWrite(w, 'documents_upload_start', write({ filename: 'big.pdf' })));
  const id = out['upload_id'] as string;
  return { id, key: `mcp-uploads/${OWNER}/${id}.pdf` };
}

describe('documents_upload_complete', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('re-checks what storage received and completes once', async () => {
    const w = writeWorld();
    const { id, key } = await start(w);
    expect(
      err(await callWrite(w, 'documents_upload_complete', write({ upload_id: id }))).slug,
    ).toBe('upload_not_received');
    const bytes = await pdfBytes(4);
    await w.storage.upload(key, bytes, 'application/pdf'); // the client's PUT
    const dry = ok(
      await callWrite(w, 'documents_upload_complete', {
        upload_id: id,
        idempotency_key: 'dry-key-0001',
        dry_run: true,
      }),
    );
    expect(dry).toEqual({ dry_run: true, would: { upload_id: id, received: true } });
    const out = ok(await callWrite(w, 'documents_upload_complete', write({ upload_id: id })));
    expect(out).toMatchObject({ document_id: id, page_count: 4, byte_length: bytes.length });
    // A second complete gets no row.
    expect(
      err(await callWrite(w, 'documents_upload_complete', write({ upload_id: id }))).slug,
    ).toBe('upload_already_completed');
  });

  it('refuses an object over 25 MB or of the wrong type, leaving the row incomplete', async () => {
    const w = writeWorld();
    const big = await start(w);
    await w.storage.upload(
      big.key,
      Buffer.alloc(MCP_UPLOAD_MAX_BYTES + 1, 0x25),
      'application/pdf',
    );
    expect(
      err(await callWrite(w, 'documents_upload_complete', write({ upload_id: big.id }))).slug,
    ).toBe('file_too_large');
    expect(await w.storage.exists(big.key)).toBe(false);
    expect((await w.uploadsRepo.find(OWNER, big.id))?.completed_at).toBeNull();

    const wrong = await start(w);
    await w.storage.upload(wrong.key, Buffer.from('GIF89a....'), 'application/pdf');
    expect(
      err(await callWrite(w, 'documents_upload_complete', write({ upload_id: wrong.id }))).slug,
    ).toBe('unsupported_file_type');
    expect((await w.uploadsRepo.find(OWNER, wrong.id))?.sha256).toBeNull();
  });

  it('converts a received .docx and stores the PDF in its place', async () => {
    const w = writeWorld();
    const { id, key } = await start(w);
    await w.storage.upload(key, docxBytes(), 'application/pdf');
    const out = ok(await callWrite(w, 'documents_upload_complete', write({ upload_id: id })));
    expect(out['page_count']).toBe(3);
    expect(w.storage.get(key)?.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('is not found for another owner, gone after expiry, and needs documents:write', async () => {
    const w = writeWorld();
    const { id, key } = await start(w);
    await w.storage.upload(key, await pdfBytes(1), 'application/pdf');
    expect(
      err(
        await callWrite(w, 'documents_upload_complete', write({ upload_id: id }), {
          owner: OTHER_OWNER,
        }),
      ).slug,
    ).toBe('upload_not_found');
    expect(
      err(
        await callWrite(w, 'documents_upload_complete', write({ upload_id: id }), {
          scopes: ['envelopes:write'],
        }),
      ).slug,
    ).toBe('insufficient_scope');
    const row = w.uploadsRepo.rows.get(id);
    if (row) row.expires_at = '2026-10-01T00:00:00.000Z';
    expect(
      err(await callWrite(w, 'documents_upload_complete', write({ upload_id: id }))).slug,
    ).toBe('upload_expired');
  });
});
