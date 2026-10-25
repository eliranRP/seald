import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { KmsClientPort } from './gdrive-kms.service';

/**
 * Key id stored in `gdrive_accounts.refresh_token_kms_key_arn` for rows whose
 * data key is wrapped by `GDRIVE_TOKEN_WRAP_KEY` instead of AWS KMS. Bump the
 * suffix when the wrap key rotates so old and new rows stay distinguishable.
 */
export const LOCAL_WRAP_KEY_ID = 'local:v1';

const MAGIC = Buffer.from('SLW1', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const DATA_KEY_BYTES = 32;

/**
 * KMS stand-in for hosts without AWS (AWS exit plan, WS-3). Same contract as
 * `AwsKmsClient`: a fresh random 32-byte AES-GCM data key per row, returned in the
 * clear for the caller to use once and wrapped for storage. The wrap is
 * AES-GCM under one 32-byte key from the environment, with the key id
 * as AAD so a blob cannot be replayed under another id.
 *
 * Wrapped layout: [4-byte magic "SLW1"][12-byte IV][16-byte tag][32-byte key].
 *
 * Weaker than KMS: the wrap key sits in the function's secrets, so anyone
 * who can read those can unwrap every row. See docs/aws-exit-plan.md, WS-3.
 */
export class LocalWrapKmsClient implements KmsClientPort {
  constructor(
    private readonly wrapKey: Buffer,
    private readonly keyId: string = LOCAL_WRAP_KEY_ID,
  ) {
    if (wrapKey.length !== 32) throw new Error('gdrive_wrap_key_invalid');
  }

  async generateDataKey(): Promise<{ plaintext: Buffer; ciphertextBlob: Buffer }> {
    const plaintext = randomBytes(DATA_KEY_BYTES);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.wrapKey, iv);
    cipher.setAAD(Buffer.from(this.keyId, 'utf8'));
    const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      plaintext,
      ciphertextBlob: Buffer.concat([MAGIC, iv, cipher.getAuthTag(), enc]),
    };
  }

  async decrypt(ciphertextBlob: Buffer): Promise<Buffer> {
    const headerBytes = MAGIC.length + IV_BYTES + TAG_BYTES;
    if (
      ciphertextBlob.length !== headerBytes + DATA_KEY_BYTES ||
      !ciphertextBlob.subarray(0, MAGIC.length).equals(MAGIC)
    ) {
      throw new Error('gdrive_wrap_blob_invalid');
    }
    const iv = ciphertextBlob.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
    const tag = ciphertextBlob.subarray(MAGIC.length + IV_BYTES, headerBytes);
    const decipher = createDecipheriv('aes-256-gcm', this.wrapKey, iv);
    decipher.setAAD(Buffer.from(this.keyId, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertextBlob.subarray(headerBytes)), decipher.final()]);
  }
}
