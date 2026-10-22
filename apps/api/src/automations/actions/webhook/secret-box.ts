import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Application-level encryption of webhook signing secrets and webhook URLs
 * (design doc § Data model). AES-GCM with a 32-byte key from
 * `AUTOMATION_SECRETS_KEY`. The key lives in the environment, never in the
 * database. Each value gets its own random 96-bit nonce; the 128-bit tag is
 * appended to the ciphertext column.
 *
 * AAD binds each ciphertext to its row and purpose:
 * - signing secret (current and previous): `automation_id`
 * - URL: `automation_id:url`
 * so a ciphertext copied onto another automation, or swapped between the
 * secret and URL columns, fails to decrypt.
 */

export const AUTOMATION_SECRETS_KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface SealedValue {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
}

export class SecretBoxError extends Error {
  constructor(message = 'automation secret could not be decrypted') {
    super(message);
    this.name = 'SecretBoxError';
  }
}

/**
 * Parse `AUTOMATION_SECRETS_KEY`: 64 hex characters, or base64 / base64url
 * that decodes to exactly 32 bytes. Anything else is null (the env schema
 * turns that into a startup error).
 */
export function parseAutomationSecretsKey(raw: string | undefined): Buffer | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(v)) return Buffer.from(v, 'hex');
  if (/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(v)) {
    const buf = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (buf.length === AUTOMATION_SECRETS_KEY_BYTES) return buf;
  }
  return null;
}

export function secretAad(automationId: string): Buffer {
  return Buffer.from(automationId, 'utf8');
}

export function urlAad(automationId: string): Buffer {
  return Buffer.from(`${automationId}:url`, 'utf8');
}

export class SecretBox {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== AUTOMATION_SECRETS_KEY_BYTES) {
      throw new Error('AUTOMATION_SECRETS_KEY must be 32 bytes');
    }
    this.key = Buffer.from(key);
  }

  seal(plaintext: string, aad: Buffer): SealedValue {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce, { authTagLength: TAG_BYTES });
    cipher.setAAD(aad);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { ciphertext: Buffer.concat([body, cipher.getAuthTag()]), nonce };
  }

  open(sealed: SealedValue, aad: Buffer): string {
    const { ciphertext, nonce } = sealed;
    if (nonce.length !== NONCE_BYTES || ciphertext.length < TAG_BYTES) throw new SecretBoxError();
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, nonce, {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(aad);
      decipher.setAuthTag(ciphertext.subarray(ciphertext.length - TAG_BYTES));
      const out = Buffer.concat([
        decipher.update(ciphertext.subarray(0, ciphertext.length - TAG_BYTES)),
        decipher.final(),
      ]);
      return out.toString('utf8');
    } catch {
      throw new SecretBoxError();
    }
  }
}

/** Prefix that makes a leaked signing secret recognizable to scanners. */
export const WEBHOOK_SECRET_PREFIX = 'seald_webhook_';

/** A new signing secret: prefix + 32 random bytes, base64url. Shown once. */
export function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('base64url')}`;
}
