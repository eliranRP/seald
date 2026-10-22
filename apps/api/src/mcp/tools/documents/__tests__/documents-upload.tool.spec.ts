import {
  MCP_UPLOAD_DAILY_CAP,
  MCP_UPLOAD_INLINE_MAX_BASE64,
  McpStagedDocumentSchema,
} from 'shared';
import {
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
} from '../../__tests__/write-harness';

describe('documents_upload', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('stages a PDF: checked, stored under the owner, completed, not attached', async () => {
    const w = writeWorld();
    const bytes = await pdfBytes(2);
    const out = ok(
      await callWrite(
        w,
        'documents_upload',
        write({ content_base64: bytes.toString('base64'), filename: 'nda.pdf' }),
      ),
    );
    expect(McpStagedDocumentSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({
      filename: 'nda.pdf',
      mime: 'application/pdf',
      page_count: 2,
      byte_length: bytes.length,
      thumbnail_url: null,
      source: 'upload',
    });
    const row = await w.uploadsRepo.find(OWNER, out['document_id'] as string);
    expect(row?.completed_at).not.toBeNull();
    expect(row?.consumed_at).toBeNull();
    expect(row?.storage_key).toBe(`mcp-uploads/${OWNER}/${out['document_id'] as string}.pdf`);
    expect(w.storage.get(row?.storage_key ?? '')?.bytes.equals(bytes)).toBe(true);
    // No storage path leaks into the result.
    expect(JSON.stringify(out)).not.toContain('mcp-uploads/');
  });

  it('reads the type from the bytes, not the file name', async () => {
    const w = writeWorld();
    const text = Buffer.from('hello, not a pdf').toString('base64');
    expect(
      err(
        await callWrite(w, 'documents_upload', write({ content_base64: text, filename: 'x.pdf' })),
      ).slug,
    ).toBe('unsupported_file_type');
    // A .docx named .pdf is still converted (the fake converter returns 3 pages).
    const docx = ok(
      await callWrite(
        w,
        'documents_upload',
        write({ content_base64: docxBytes().toString('base64'), filename: 'x.pdf' }),
      ),
    );
    expect(docx['page_count']).toBe(3);
    w.gotenberg = 'fail';
    const failed = err(
      await callWrite(
        w,
        'documents_upload',
        write({ content_base64: docxBytes().toString('base64'), filename: 'y.docx' }),
      ),
    );
    expect(failed).toMatchObject({ slug: 'conversion_failed' });
  });

  it('enforces the inline size limit in the schema and refuses bad base64', async () => {
    const w = writeWorld();
    const tooBig = 'A'.repeat(MCP_UPLOAD_INLINE_MAX_BASE64 + 4);
    expect(
      err(
        await callWrite(
          w,
          'documents_upload',
          write({ content_base64: tooBig, filename: 'a.pdf' }),
        ),
      ).slug,
    ).toBe('validation_error');
    expect(
      err(
        await callWrite(
          w,
          'documents_upload',
          write({ content_base64: '%%%%', filename: 'a.pdf' }),
        ),
      ).slug,
    ).toBe('invalid_base64');
    const broken = Buffer.from('%PDF-1.7 broken').toString('base64');
    expect(
      err(
        await callWrite(
          w,
          'documents_upload',
          write({ content_base64: broken, filename: 'a.pdf' }),
        ),
      ).slug,
    ).toBe('file_unreadable');
    expect(w.uploadsRepo.rows.size).toBe(0);
  });

  it('dry run inspects without storing; the daily cap stops the 21st upload', async () => {
    const w = writeWorld();
    const b64 = (await pdfBytes(1)).toString('base64');
    const dry = ok(
      await callWrite(w, 'documents_upload', {
        content_base64: b64,
        filename: 'a.pdf',
        idempotency_key: 'dry-key-0001',
        dry_run: true,
      }),
    );
    expect(dry).toMatchObject({
      dry_run: true,
      would: { page_count: 1, uploads_today: 0, daily_cap: MCP_UPLOAD_DAILY_CAP },
    });
    expect(w.uploadsRepo.rows.size).toBe(0);
    for (let i = 0; i < MCP_UPLOAD_DAILY_CAP; i++) {
      ok(await callWrite(w, 'documents_upload', write({ content_base64: b64, filename: 'a.pdf' })));
    }
    const capped = err(
      await callWrite(w, 'documents_upload', write({ content_base64: b64, filename: 'a.pdf' })),
    );
    expect(capped).toMatchObject({
      slug: 'upload_daily_cap',
      retryable: true,
      retry_after_seconds: 43_200,
    });
  });

  it('replays the same key without a second upload', async () => {
    const w = writeWorld();
    const args = {
      content_base64: (await pdfBytes(1)).toString('base64'),
      filename: 'a.pdf',
      idempotency_key: 'same-key-0001',
      dry_run: false,
    };
    const first = ok(await callWrite(w, 'documents_upload', args));
    const again = ok(await callWrite(w, 'documents_upload', args));
    expect(again['document_id']).toBe(first['document_id']);
    expect(w.uploadsRepo.rows.size).toBe(1);
  });

  it('needs documents:write', async () => {
    const w = writeWorld();
    const args = write({
      content_base64: (await pdfBytes(1)).toString('base64'),
      filename: 'a.pdf',
    });
    expect(
      err(await callWrite(w, 'documents_upload', args, { scopes: ['envelopes:write'] })).slug,
    ).toBe('insufficient_scope');
    expect(err(await callWrite(w, 'documents_upload', write({ filename: 'a.pdf' }))).slug).toBe(
      'validation_error',
    );
  });
});
