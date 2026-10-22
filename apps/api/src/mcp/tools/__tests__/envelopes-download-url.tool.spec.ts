import { EnvelopesDownloadUrlOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../leak-scan';
import {
  DOC_1,
  ENVELOPE_ID,
  OTHER_ENVELOPE_ID,
  OTHER_OWNER,
  READ_METHODS,
  call,
  envelopeFixture,
  errorOf,
  okOf,
  world,
} from './harness';

describe('envelopes_download_url', () => {
  it('returns a five-minute signed URL for the envelope', async () => {
    const w = world();
    const out = okOf(
      await call(w, 'envelopes_download_url', { envelope_id: ENVELOPE_ID, kind: 'original' }),
    );
    expect(EnvelopesDownloadUrlOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toEqual({ url: w.downloadUrl, kind: 'original', expires_in_seconds: 300 });
    expect(w.calls).toEqual(['envelopes.getDownloadUrl']);
    // The signed URL is allowed only in `url`, and only on this tool.
    expect(findTokenShapedStrings(out, { signedUrlFields: ['url'] })).toEqual([]);
    expect(findTokenShapedStrings(out).map((f) => f.pattern)).toContain('signed url query');
  });

  it('serves one document of a multi-document envelope', async () => {
    const w = world();
    const out = okOf(
      await call(w, 'envelopes_download_url', { envelope_id: ENVELOPE_ID, document_id: DOC_1 }),
    );
    expect(out).toMatchObject({ document_id: DOC_1, kind: 'original', expires_in_seconds: 300 });
    expect(w.calls).toEqual(['documents.downloadUrl']);
  });

  it('refuses audit for a single document', async () => {
    const w = world();
    const err = errorOf(
      await call(w, 'envelopes_download_url', {
        envelope_id: ENVELOPE_ID,
        document_id: DOC_1,
        kind: 'audit',
      }),
    );
    expect(err.slug).toBe('validation_error');
  });

  it('answers file_not_ready as retryable, pointing at envelopes_status', async () => {
    const w = world();
    const err = errorOf(
      await call(w, 'envelopes_download_url', { envelope_id: ENVELOPE_ID, kind: 'sealed' }),
    );
    expect(err).toMatchObject({
      slug: 'file_not_ready',
      retryable: true,
      next_steps: [{ tool: 'envelopes_status', args: { envelope_id: ENVELOPE_ID } }],
    });
  });

  it('rejects a missing required field, an unknown field and a bad kind', async () => {
    const w = world();
    for (const args of [
      {},
      { envelope_id: ENVELOPE_ID, ttl: 3600 },
      { envelope_id: ENVELOPE_ID, kind: 'declined' },
    ]) {
      expect(errorOf(await call(w, 'envelopes_download_url', args)).slug).toBe('validation_error');
    }
    expect(w.calls).toEqual([]);
  });

  it('is insufficient_scope without envelopes:read', async () => {
    const w = world();
    const err = errorOf(
      await call(w, 'envelopes_download_url', { envelope_id: ENVELOPE_ID }, ['envelopes:write']),
    );
    expect(err.slug).toBe('insufficient_scope');
  });

  it("answers another owner's envelope as not found", async () => {
    const w = world();
    w.envelopes.push(envelopeFixture({ id: OTHER_ENVELOPE_ID, owner_id: OTHER_OWNER }));
    const err = errorOf(
      await call(w, 'envelopes_download_url', { envelope_id: OTHER_ENVELOPE_ID }),
    );
    expect(err.slug).toBe('envelope_not_found');
  });

  it('only calls read methods', async () => {
    const w = world();
    await call(w, 'envelopes_download_url', { envelope_id: ENVELOPE_ID });
    for (const c of w.calls) expect(READ_METHODS).toContain(c);
  });
});
