import { describe, it, expect, vi, afterEach } from 'vitest';
import { fileProblem, MAX_VERIFY_FILE_BYTES, sha256Hex } from '../sha256';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sha256Hex', () => {
  it('hashes the bytes with SubtleCrypto and returns lowercase hex', async () => {
    const digest = vi.fn().mockResolvedValue(new Uint8Array([0, 15, 255]).buffer);
    vi.stubGlobal('crypto', { subtle: { digest } });
    const blob = new Blob(['hello']);
    if (typeof blob.arrayBuffer !== 'function') {
      Object.defineProperty(blob, 'arrayBuffer', {
        value: () => Promise.resolve(new ArrayBuffer(5)),
      });
    }

    await expect(sha256Hex(blob)).resolves.toBe('000fff');
    expect(digest).toHaveBeenCalledWith('SHA-256', expect.any(ArrayBuffer));
  });

  it('rejects when SubtleCrypto is unavailable', async () => {
    vi.stubGlobal('crypto', {});
    await expect(sha256Hex(new Blob(['x']))).rejects.toThrow('subtle_crypto_unavailable');
  });
});

describe('fileProblem', () => {
  const file = (name: string, type: string, size = 10): File => {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };

  it('accepts a PDF by type or by extension', () => {
    expect(fileProblem(file('a.pdf', 'application/pdf'))).toBeNull();
    expect(fileProblem(file('A.PDF', ''))).toBeNull();
  });

  it('rejects other files and anything over the cap', () => {
    expect(fileProblem(file('a.png', 'image/png'))).toBe('not_pdf');
    expect(fileProblem(file('a.pdf', 'application/pdf', MAX_VERIFY_FILE_BYTES + 1))).toBe(
      'too_large',
    );
    expect(fileProblem(file('a.pdf', 'application/pdf', MAX_VERIFY_FILE_BYTES))).toBeNull();
  });
});
