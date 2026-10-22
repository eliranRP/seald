import { randomBytes } from 'node:crypto';
import type { FeatureFlag } from 'shared';
import { parseEnv } from '../../../../config/env.schema';
import {
  SecretBox,
  SecretBoxError,
  WEBHOOK_SECRET_PREFIX,
  generateWebhookSecret,
  parseAutomationSecretsKey,
  secretAad,
  urlAad,
} from '../secret-box';

const KEY = Buffer.alloc(32, 7);
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const URL_TEXT = 'https://hooks.example.com/in/abc?token=zzz';

describe('SecretBox (AES-GCM, 32-byte key)', () => {
  const box = new SecretBox(KEY);

  it('round-trips the signing secret and the URL', () => {
    const secret = generateWebhookSecret();
    const s = box.seal(secret, secretAad(A));
    const u = box.seal(URL_TEXT, urlAad(A));
    expect(box.open(s, secretAad(A))).toBe(secret);
    expect(box.open(u, urlAad(A))).toBe(URL_TEXT);
  });

  it('never stores plaintext and uses a fresh 96-bit nonce per value', () => {
    const a = box.seal(URL_TEXT, urlAad(A));
    const b = box.seal(URL_TEXT, urlAad(A));
    expect(a.nonce).toHaveLength(12);
    expect(a.nonce.equals(b.nonce)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.ciphertext.includes(Buffer.from('hooks.example.com'))).toBe(false);
    // ciphertext || 16-byte tag
    expect(a.ciphertext.length).toBe(Buffer.byteLength(URL_TEXT) + 16);
  });

  it('binds each ciphertext to its automation and purpose (AAD)', () => {
    const s = box.seal('seald_webhook_x', secretAad(A));
    const u = box.seal(URL_TEXT, urlAad(A));
    expect(() => box.open(s, secretAad(B))).toThrow(SecretBoxError);
    expect(() => box.open(u, urlAad(B))).toThrow(SecretBoxError);
    // Swapping the secret and URL columns fails.
    expect(() => box.open(s, urlAad(A))).toThrow(SecretBoxError);
    expect(() => box.open(u, secretAad(A))).toThrow(SecretBoxError);
  });

  it('rejects tampering, a wrong key, and truncated input', () => {
    const s = box.seal('seald_webhook_x', secretAad(A));
    const flipped = Buffer.from(s.ciphertext);
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => box.open({ ...s, ciphertext: flipped }, secretAad(A))).toThrow(SecretBoxError);
    expect(() => new SecretBox(Buffer.alloc(32, 8)).open(s, secretAad(A))).toThrow(SecretBoxError);
    expect(() => box.open({ ...s, ciphertext: s.ciphertext.subarray(0, 4) }, secretAad(A))).toThrow(
      SecretBoxError,
    );
    expect(() => box.open({ ...s, nonce: s.nonce.subarray(0, 8) }, secretAad(A))).toThrow(
      SecretBoxError,
    );
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => new SecretBox(Buffer.alloc(16))).toThrow(/32 bytes/);
  });

  it('generates prefixed, high-entropy, unique secrets', () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a.startsWith(WEBHOOK_SECRET_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(Buffer.from(a.slice(WEBHOOK_SECRET_PREFIX.length), 'base64url')).toHaveLength(32);
  });
});

describe('parseAutomationSecretsKey', () => {
  const raw = randomBytes(32);

  it.each([
    ['hex', raw.toString('hex')],
    ['base64', raw.toString('base64')],
    ['base64url', raw.toString('base64url')],
  ])('accepts 32 bytes as %s', (_label, text) => {
    expect(parseAutomationSecretsKey(text)?.equals(raw)).toBe(true);
  });

  it.each([
    undefined,
    '',
    'short',
    'a'.repeat(63),
    randomBytes(16).toString('hex'),
    randomBytes(31).toString('base64'),
    randomBytes(33).toString('base64'),
  ])('rejects %p', (text) => {
    expect(parseAutomationSecretsKey(text)).toBeNull();
  });
});

describe('env schema: AUTOMATION_SECRETS_KEY', () => {
  type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
  const host = globalThis as unknown as OverrideHost;
  const base = {
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    CORS_ORIGIN: 'http://localhost:5173',
    APP_PUBLIC_URL: 'http://localhost:5173',
    DATABASE_URL: 'postgres://u:p@host:5432/db',
  };

  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  it('is unread while the flag is off', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: false };
    expect(() => parseEnv(base)).not.toThrow();
  });

  it('startup throws when the flag is on and the key is missing', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    expect(() => parseEnv(base)).toThrow(/AUTOMATION_SECRETS_KEY/);
  });

  it('the kill switch keeps a keyless boot working with the flag on', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    expect(() => parseEnv({ ...base, AUTOMATIONS_DISABLED: 'true' })).not.toThrow();
  });

  it('startup throws on a short or malformed key, flag on or off', () => {
    for (const flag of [true, false]) {
      host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: flag };
      expect(() => parseEnv({ ...base, AUTOMATION_SECRETS_KEY: 'abc123' })).toThrow(
        /AUTOMATION_SECRETS_KEY/,
      );
      expect(() =>
        parseEnv({ ...base, AUTOMATION_SECRETS_KEY: randomBytes(16).toString('hex') }),
      ).toThrow(/AUTOMATION_SECRETS_KEY/);
    }
  });

  it('accepts a 32-byte key with the flag on', () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
    const env = parseEnv({ ...base, AUTOMATION_SECRETS_KEY: randomBytes(32).toString('hex') });
    expect(env.AUTOMATION_SECRETS_KEY).toHaveLength(64);
  });
});
