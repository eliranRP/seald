import { randomBytes } from 'node:crypto';
import type { AppEnv } from '../../../config/env.schema';
import { GDriveKmsService, type KmsClientPort } from '../gdrive-kms.service';
import { LOCAL_WRAP_KEY_ID, LocalWrapKmsClient } from '../local-wrap-kms-client';

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

describe('GDriveKmsService with the local wrap key (AWS exit plan, WS-3)', () => {
  const WRAP_KEY = randomBytes(32);

  it('wraps new rows locally and stamps local:v1', async () => {
    const svc = new GDriveKmsService(new LocalWrapKmsClient(WRAP_KEY), LOCAL_WRAP_KEY_ID);
    const aad = Buffer.from('row-1');
    const { ciphertext, kmsKeyArn } = await svc.encrypt('1//refresh-local', aad);
    expect(kmsKeyArn).toBe(LOCAL_WRAP_KEY_ID);
    await expect(svc.decrypt(ciphertext, kmsKeyArn, aad)).resolves.toBe('1//refresh-local');
  });

  it('fails closed under a different wrap key or AAD', async () => {
    const svc = new GDriveKmsService(new LocalWrapKmsClient(WRAP_KEY), LOCAL_WRAP_KEY_ID);
    const { ciphertext } = await svc.encrypt('1//refresh-local', Buffer.from('row-1'));
    const other = new GDriveKmsService(new LocalWrapKmsClient(randomBytes(32)), LOCAL_WRAP_KEY_ID);
    await expect(
      other.decrypt(ciphertext, LOCAL_WRAP_KEY_ID, Buffer.from('row-1')),
    ).rejects.toThrow('gdrive_kms_decrypt_failed');
    await expect(
      svc.decrypt(ciphertext, LOCAL_WRAP_KEY_ID, Buffer.from('row-2')),
    ).rejects.toThrow();
  });

  it('fromEnv uses the wrap key', () => {
    const svc = GDriveKmsService.fromEnv({
      GDRIVE_TOKEN_WRAP_KEY: WRAP_KEY.toString('hex'),
    } as unknown as AppEnv);
    expect(svc.currentKeyArn).toBe(LOCAL_WRAP_KEY_ID);
  });

  it('fromEnv throws with neither the wrap key nor KMS configured', () => {
    expect(() => GDriveKmsService.fromEnv({} as unknown as AppEnv)).toThrow(
      /gdrive_kms_misconfigured/,
    );
  });
});
