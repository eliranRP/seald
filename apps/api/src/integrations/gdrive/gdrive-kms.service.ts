import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { parseAutomationSecretsKey } from '../../automations/actions/webhook/secret-box';
import type { AppEnv } from '../../config/env.schema';
import { LOCAL_WRAP_KEY_ID, LocalWrapKmsClient } from './local-wrap-kms-client';

/**
 * Port over the subset of KMS operations the OAuth refresh-token store
 * needs. Lets the unit suite exercise the AES envelope path without an
 * real key at test time. The production implementation is
 * `LocalWrapKmsClient` (AES-GCM under GDRIVE_TOKEN_WRAP_KEY).
 */
export interface KmsClientPort {
  generateDataKey(keyId: string): Promise<{ plaintext: Buffer; ciphertextBlob: Buffer }>;
  decrypt(ciphertextBlob: Buffer): Promise<Buffer>;
}

/**
 * Envelope encryption for OAuth refresh tokens.
 * Layout of the bytea column:
 *   [4-byte BE wrapped-key-len][wrapped data key][12-byte IV][16-byte tag][ciphertext]
 *
 * AES-256-GCM with a fresh data key per row. The data key is wrapped by
 * GDRIVE_TOKEN_WRAP_KEY; we never store the raw data key. The plaintext
 * refresh token NEVER touches `bytea` directly (red-flag row 3). Errors
 * deliberately omit the plaintext from messages so logs cannot leak it.
 */
@Injectable()
export class GDriveKmsService {
  private readonly client: KmsClientPort;
  private readonly keyArn: string;

  constructor(client: KmsClientPort, keyArn: string) {
    this.client = client;
    this.keyArn = keyArn;
  }

  static fromEnv(env: AppEnv): GDriveKmsService {
    const wrapKey = parseAutomationSecretsKey(env.GDRIVE_TOKEN_WRAP_KEY);
    if (!wrapKey) {
      throw new Error('gdrive_kms_misconfigured: GDRIVE_TOKEN_WRAP_KEY required');
    }
    return new GDriveKmsService(new LocalWrapKmsClient(wrapKey), LOCAL_WRAP_KEY_ID);
  }

  get currentKeyArn(): string {
    return this.keyArn;
  }

  async encrypt(
    plaintext: string,
    aad?: Buffer,
  ): Promise<{ ciphertext: Buffer; kmsKeyArn: string }> {
    let dataKey: { plaintext: Buffer; ciphertextBlob: Buffer };
    try {
      dataKey = await this.client.generateDataKey(this.keyArn);
    } catch {
      // Re-throw with a generic message — never echo the plaintext.
      throw new Error('gdrive_kms_encrypt_failed');
    }
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', dataKey.plaintext, iv);
      // Bind ciphertext to the row via AAD (Additional Authenticated Data).
      // Without AAD an attacker with DB write access could swap encrypted
      // tokens between rows (cryptography-expert §6.2).
      if (aad) cipher.setAAD(aad);
      const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const wrappedLen = Buffer.alloc(4);
      wrappedLen.writeUInt32BE(dataKey.ciphertextBlob.length, 0);
      return {
        ciphertext: Buffer.concat([wrappedLen, dataKey.ciphertextBlob, iv, tag, enc]),
        kmsKeyArn: this.keyArn,
      };
    } finally {
      // Zero the plaintext data key so it doesn't linger in heap memory.
      dataKey.plaintext.fill(0);
    }
  }

  async decrypt(ciphertext: Buffer, kmsKeyArn: string, aad?: Buffer): Promise<string> {
    void kmsKeyArn; // every stored row is wrapped by the local key
    const client = this.client;
    if (ciphertext.length < 4 + 12 + 16) throw new Error('gdrive_kms_decrypt_failed');
    const wrappedLen = ciphertext.readUInt32BE(0);
    const offset = 4 + wrappedLen;
    const wrapped = ciphertext.subarray(4, offset);
    const iv = ciphertext.subarray(offset, offset + 12);
    const tag = ciphertext.subarray(offset + 12, offset + 28);
    const enc = ciphertext.subarray(offset + 28);
    let dataKey: Buffer;
    try {
      dataKey = await client.decrypt(wrapped);
    } catch {
      throw new Error('gdrive_kms_decrypt_failed');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', dataKey, iv);
      // Must match the AAD used at encryption time; mismatches cause an auth
      // tag failure — prevents cross-row token swaps (cryptography-expert §6.2).
      if (aad) decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
      return dec.toString('utf8');
    } finally {
      // Zero the plaintext data key so it doesn't linger in heap memory.
      dataKey.fill(0);
    }
  }
}
