import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSigningApiMock } from '@/test/signingApiMock';

// vi.mock is hoisted to the top of the file, so the factory closure cannot
// reference any module-scoped variable. Build the mock fresh inside the
// factory and re-import it from the same module path under test to grab
// the post spy back.
vi.mock('@/lib/api/signApiClient', () => createSigningApiMock());

import { signApiClient } from '@/lib/api/signApiClient';
import { uploadSignature } from '../signingApi';
import type { SignatureInput } from '../signingApi';

const post = signApiClient.post as unknown as ReturnType<typeof vi.fn>;

function fakeBlob(): Blob {
  // Minimal binary content; we only care about the FormData wiring, not
  // the byte-level shape, so a 4-byte stub is enough.
  return new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
}

describe('uploadSignature — FormData wiring', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({
      data: {
        id: 'signer-1',
        email: 'a@b.com',
        name: 'A',
        color: '#000000',
        role: 'signatory',
        status: 'viewing',
        viewed_at: null,
        tc_accepted_at: null,
        signed_at: null,
        declined_at: null,
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {},
    });
  });
  afterEach(() => {
    post.mockReset();
  });

  it("includes kind='initials' on the FormData payload when the upload is initials", async () => {
    const input: SignatureInput = {
      blob: fakeBlob(),
      format: 'drawn',
      kind: 'initials',
      stroke_count: 7,
    };
    await uploadSignature(input);

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0]!;
    expect(url).toBe('/sign/signature');
    expect(body).toBeInstanceOf(FormData);
    const fd = body as FormData;

    // Confirms the kind discriminator survives serialization. Without
    // this field on the wire, the backend silently re-uses the signature
    // path and the burn-in regression returns.
    expect(fd.get('kind')).toBe('initials');
    expect(fd.get('format')).toBe('drawn');
    expect(fd.get('stroke_count')).toBe('7');
    expect(fd.get('image')).toBeInstanceOf(Blob);
  });

  it("includes kind='signature' when the upload is a full signature", async () => {
    const input: SignatureInput = {
      blob: fakeBlob(),
      format: 'typed',
      kind: 'signature',
      font: 'Caveat',
    };
    await uploadSignature(input);

    expect(post).toHaveBeenCalledTimes(1);
    const fd = post.mock.calls[0]![1] as FormData;
    expect(fd.get('kind')).toBe('signature');
    expect(fd.get('format')).toBe('typed');
    expect(fd.get('font')).toBe('Caveat');
  });

  it('omits the kind field entirely when the caller does not specify one', async () => {
    const input: SignatureInput = { blob: fakeBlob(), format: 'drawn' };
    await uploadSignature(input);

    const fd = post.mock.calls[0]![1] as FormData;
    expect(fd.has('kind')).toBe(false);
  });
});
