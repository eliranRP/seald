import { GDriveKmsService, type KmsClientPort } from '../gdrive-kms.service';

/**
 * Mock KMS client mimicking AWS KMS GenerateDataKey + Decrypt by wrapping
 * the data key in a deterministic envelope (key id || raw key bytes).
 * Real AWS does the same conceptually — just with HSM-backed wrapping.
 */
class MockKmsClient implements KmsClientPort {
  generateDataKeyCalls = 0;
  decryptCalls = 0;
  lastCiphertext: Buffer | null = null;
  fail: 'none' | 'generate' | 'decrypt' = 'none';

  async generateDataKey(keyId: string): Promise<{ plaintext: Buffer; ciphertextBlob: Buffer }> {
    this.generateDataKeyCalls++;
    if (this.fail === 'generate') throw new Error('kms_unavailable');
    const plaintext = Buffer.from(`raw-key-${this.generateDataKeyCalls}`.padEnd(32, '0'));
    const ciphertextBlob = Buffer.concat([Buffer.from(`${keyId}|`), plaintext]);
    this.lastCiphertext = ciphertextBlob;
    return { plaintext, ciphertextBlob };
  }

  async decrypt(ciphertextBlob: Buffer): Promise<Buffer> {
    this.decryptCalls++;
    if (this.fail === 'decrypt') throw new Error('kms_decrypt_failed');
    const sep = ciphertextBlob.indexOf(0x7c); // '|'
    return ciphertextBlob.subarray(sep + 1);
  }
}

describe('GDriveKmsService', () => {
  const KEY_ARN = 'arn:aws:kms:us-east-1:000000000000:key/test';
  let kms: MockKmsClient;
  let svc: GDriveKmsService;

  beforeEach(() => {
    kms = new MockKmsClient();
    svc = new GDriveKmsService(kms, KEY_ARN);
  });

  it('encrypts then decrypts: round-trip recovers the original plaintext', async () => {
    const plaintext = '1//0gRefreshToken-AbC123_xyz';
    const { ciphertext, kmsKeyArn } = await svc.encrypt(plaintext);
    expect(kmsKeyArn).toBe(KEY_ARN);
    const recovered = await svc.decrypt(ciphertext, kmsKeyArn);
    expect(recovered).toBe(plaintext);
  });

  it('ciphertext column NEVER contains plaintext as a substring', async () => {
    const plaintext = '1//0gRefreshToken-VERY-SECRET-DO-NOT-LEAK';
    const { ciphertext } = await svc.encrypt(plaintext);
    // Convert to string in every plausible encoding and ensure none leak.
    expect(ciphertext.toString('utf8')).not.toContain(plaintext);
    expect(ciphertext.toString('binary')).not.toContain(plaintext);
    expect(ciphertext.toString('hex')).not.toContain(
      Buffer.from(plaintext, 'utf8').toString('hex'),
    );
  });

  it('encrypt failure surfaces as an Error (no plaintext in message)', async () => {
    expect.assertions(2);
    kms.fail = 'generate';

    try {
      await svc.encrypt('top-secret');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(Error);
      expect(String((err as Error).message)).not.toContain('top-secret');
    }
  });

  it('decrypt with mismatched ciphertext fails', async () => {
    kms.fail = 'decrypt';
    await expect(svc.decrypt(Buffer.from('garbage-ciphertext'), KEY_ARN)).rejects.toThrow();
  });
});
