import { MCP_UPLOAD_MAX_BYTES, MCP_UPLOAD_PUT_TTL_SECONDS } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import {
  OWNER,
  callWrite,
  err,
  ok,
  resetFlags,
  setFlags,
  write,
  writeWorld,
} from '../../__tests__/write-harness';

describe('documents_upload_start', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('makes a pending row and an owner-scoped presigned PUT that expires in 5 minutes', async () => {
    const w = writeWorld();
    const out = ok(
      await callWrite(
        w,
        'documents_upload_start',
        write({ filename: 'big.pdf', byte_length: 5_000_000 }),
      ),
    );
    expect(out).toMatchObject({
      method: 'PUT',
      expires_in_seconds: MCP_UPLOAD_PUT_TTL_SECONDS,
      max_bytes: MCP_UPLOAD_MAX_BYTES,
    });
    const id = out['upload_id'] as string;
    expect(w.storage.signedUploads).toEqual([`mcp-uploads/${OWNER}/${id}.pdf`]);
    const row = await w.uploadsRepo.find(OWNER, id);
    expect(row).toMatchObject({ completed_at: null, sha256: null, byte_length: null, mime: null });
    // The signed URL is allowed only in upload_url.
    expect(findTokenShapedStrings(out, { signedUrlFields: ['upload_url'] })).toEqual([]);
    expect(findTokenShapedStrings(out).length).toBeGreaterThan(0);
  });

  it('refuses a size hint over 25 MB before making a URL; the dry run makes none', async () => {
    const w = writeWorld();
    expect(
      err(
        await callWrite(
          w,
          'documents_upload_start',
          write({ filename: 'x.pdf', byte_length: MCP_UPLOAD_MAX_BYTES + 1 }),
        ),
      ).slug,
    ).toBe('file_too_large');
    const dry = ok(
      await callWrite(w, 'documents_upload_start', {
        filename: 'x.pdf',
        idempotency_key: 'dry-key-0001',
        dry_run: true,
      }),
    );
    expect(dry).toMatchObject({ dry_run: true, would: { max_bytes: MCP_UPLOAD_MAX_BYTES } });
    expect(w.storage.signedUploads).toEqual([]);
    expect(w.uploadsRepo.rows.size).toBe(0);
  });

  it('needs documents:write and a filename', async () => {
    const w = writeWorld();
    expect(
      err(
        await callWrite(w, 'documents_upload_start', write({ filename: 'x.pdf' }), {
          scopes: ['envelopes:read'],
        }),
      ).slug,
    ).toBe('insufficient_scope');
    expect(err(await callWrite(w, 'documents_upload_start', write({}))).slug).toBe(
      'validation_error',
    );
  });
});
