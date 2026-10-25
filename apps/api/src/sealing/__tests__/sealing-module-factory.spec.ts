import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
import type { AppEnv } from '../../config/env.schema';
import { KmsPadesSigner, NoopPadesSigner, P12PadesSigner } from '../pades-signer';
import { selectPadesSigner, type SignerSelectionLogger } from '../sealing.module';
import type { TsaClient } from '../tsa-client';

/**
 * Rule S.1 (WP-01 item 1): the PadesSigner factory must throw on any
 * misconfigured provider instead of silently falling back to Noop, and a
 * production host only gets Noop with the explicit escape hatch.
 */

type EnvOverrides = { [K in keyof AppEnv]?: AppEnv[K] | undefined };

function makeEnv(overrides: EnvOverrides): AppEnv {
  const base = { NODE_ENV: 'development' } as Record<string, unknown>;
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) base[k] = v;
  }
  return base as unknown as AppEnv;
}

const tsaOff = { configured: false } as unknown as TsaClient;

function quietLogger(): SignerSelectionLogger & { warns: string[]; logs: string[] } {
  const warns: string[] = [];
  const logs: string[] = [];
  return {
    warns,
    logs,
    log: (m: string) => logs.push(m),
    warn: (m: string) => warns.push(m),
  };
}

function selfSignedCert(): { certPem: string; keys: forge.pki.rsa.KeyPair } {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 1024, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: 'commonName', value: 'seald-factory-test' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keys };
}

describe('selectPadesSigner (rule S.1)', () => {
  let dir: string;
  let p12Path: string;
  let certPem: string;
  const p12Pass = 'factory-pass';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'seald-factory-'));
    const { certPem: pem, keys } = selfSignedCert();
    certPem = pem;
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
      keys.privateKey,
      [forge.pki.certificateFromPem(pem)],
      p12Pass,
      { algorithm: '3des' },
    );
    p12Path = join(dir, 'bundle.p12');
    writeFileSync(p12Path, Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  describe('kms', () => {
    const full: EnvOverrides = {
      PDF_SIGNING_PROVIDER: 'kms',
      PDF_SIGNING_KMS_KEY_ID: 'alias/seald-test',
      PDF_SIGNING_KMS_REGION: 'us-east-1',
    };

    it('builds KmsPadesSigner when key, region and cert are set', () => {
      const signer = selectPadesSigner(
        makeEnv({ ...full, PDF_SIGNING_KMS_CERT_PEM: certPem }),
        tsaOff,
        quietLogger(),
      );
      expect(signer).toBeInstanceOf(KmsPadesSigner);
    });

    it.each([
      ['PDF_SIGNING_KMS_KEY_ID', { PDF_SIGNING_KMS_KEY_ID: undefined }],
      ['PDF_SIGNING_KMS_REGION', { PDF_SIGNING_KMS_REGION: undefined }],
    ] as const)('throws when %s is missing', (name, drop) => {
      expect(() =>
        selectPadesSigner(
          makeEnv({ ...full, PDF_SIGNING_KMS_CERT_PEM: certPem, ...drop }),
          tsaOff,
          quietLogger(),
        ),
      ).toThrow(new RegExp(`PDF_SIGNING_PROVIDER=kms but ${name}`));
    });

    it('throws when neither cert PEM nor cert path is set', () => {
      expect(() => selectPadesSigner(makeEnv(full), tsaOff, quietLogger())).toThrow(
        /PDF_SIGNING_KMS_CERT_PEM or PDF_SIGNING_KMS_CERT_PEM_PATH/,
      );
    });

    it('throws when the cert path does not exist', () => {
      expect(() =>
        selectPadesSigner(
          makeEnv({ ...full, PDF_SIGNING_KMS_CERT_PEM_PATH: join(dir, 'missing.pem') }),
          tsaOff,
          quietLogger(),
        ),
      ).toThrow(/cannot read cert PEM/);
    });

    it('still throws on a missing key id under NODE_ENV=test', () => {
      expect(() =>
        selectPadesSigner(
          makeEnv({ ...full, NODE_ENV: 'test', PDF_SIGNING_KMS_KEY_ID: undefined }),
          tsaOff,
          quietLogger(),
        ),
      ).toThrow(/PDF_SIGNING_KMS_KEY_ID/);
    });
  });

  describe('local', () => {
    it('builds P12PadesSigner when the P12 exists', () => {
      const signer = selectPadesSigner(
        makeEnv({
          PDF_SIGNING_PROVIDER: 'local',
          PDF_SIGNING_LOCAL_P12_PATH: p12Path,
          PDF_SIGNING_LOCAL_P12_PASS: p12Pass,
        }),
        tsaOff,
        quietLogger(),
      );
      expect(signer).toBeInstanceOf(P12PadesSigner);
    });

    it('throws when the P12 path is missing', () => {
      expect(() =>
        selectPadesSigner(
          makeEnv({ PDF_SIGNING_PROVIDER: 'local', PDF_SIGNING_LOCAL_P12_PASS: p12Pass }),
          tsaOff,
          quietLogger(),
        ),
      ).toThrow(
        /PDF_SIGNING_PROVIDER=local but PDF_SIGNING_LOCAL_P12_PATH or PDF_SIGNING_LOCAL_P12_BASE64 not set/,
      );
    });

    it('builds P12PadesSigner from an inline base64 P12 with no file (edge function)', () => {
      const logger = quietLogger();
      const signer = selectPadesSigner(
        makeEnv({
          PDF_SIGNING_PROVIDER: 'local',
          PDF_SIGNING_LOCAL_P12_BASE64: readFileSync(p12Path).toString('base64'),
          PDF_SIGNING_LOCAL_P12_PASS: p12Pass,
        }),
        tsaOff,
        logger,
      );
      expect(signer).toBeInstanceOf(P12PadesSigner);
      expect(logger.logs.join('\n')).toContain('p12=PDF_SIGNING_LOCAL_P12_BASE64');
    });

    it('prefers the inline P12 over a path that does not exist', () => {
      const signer = selectPadesSigner(
        makeEnv({
          PDF_SIGNING_PROVIDER: 'local',
          PDF_SIGNING_LOCAL_P12_PATH: join(dir, 'nope.p12'),
          PDF_SIGNING_LOCAL_P12_BASE64: readFileSync(p12Path).toString('base64'),
          PDF_SIGNING_LOCAL_P12_PASS: p12Pass,
        }),
        tsaOff,
        quietLogger(),
      );
      expect(signer).toBeInstanceOf(P12PadesSigner);
    });

    it('throws when the P12 password is missing', () => {
      expect(() =>
        selectPadesSigner(
          makeEnv({ PDF_SIGNING_PROVIDER: 'local', PDF_SIGNING_LOCAL_P12_PATH: p12Path }),
          tsaOff,
          quietLogger(),
        ),
      ).toThrow(/PDF_SIGNING_LOCAL_P12_PASS not set/);
    });

    it('throws when neither P12 var is set outside NODE_ENV=test', () => {
      for (const NODE_ENV of ['development', 'production'] as const) {
        expect(() =>
          selectPadesSigner(
            makeEnv({ NODE_ENV, PDF_SIGNING_PROVIDER: 'local' }),
            tsaOff,
            quietLogger(),
          ),
        ).toThrow(
          /PDF_SIGNING_LOCAL_P12_PATH or PDF_SIGNING_LOCAL_P12_BASE64, PDF_SIGNING_LOCAL_P12_PASS not set/,
        );
      }
    });

    it('throws when the P12 file does not exist (every NODE_ENV)', () => {
      for (const NODE_ENV of ['development', 'production', 'test'] as const) {
        expect(() =>
          selectPadesSigner(
            makeEnv({
              NODE_ENV,
              PDF_SIGNING_PROVIDER: 'local',
              PDF_SIGNING_LOCAL_P12_PATH: join(dir, 'nope.p12'),
              PDF_SIGNING_LOCAL_P12_PASS: p12Pass,
            }),
            tsaOff,
            quietLogger(),
          ),
        ).toThrow(/does not exist/);
      }
    });

    it('treats local with no P12 vars as unset under NODE_ENV=test (e2e harness)', () => {
      const logger = quietLogger();
      const signer = selectPadesSigner(
        makeEnv({ NODE_ENV: 'test', PDF_SIGNING_PROVIDER: 'local' }),
        tsaOff,
        logger,
      );
      expect(signer).toBeInstanceOf(NoopPadesSigner);
      expect(logger.warns.join('\n')).toMatch(/NoopPadesSigner/);
    });
  });

  describe('sslcom', () => {
    it('throws not implemented', () => {
      expect(() =>
        selectPadesSigner(makeEnv({ PDF_SIGNING_PROVIDER: 'sslcom' }), tsaOff, quietLogger()),
      ).toThrow(/sslcom is not implemented/);
    });
  });

  describe('unset', () => {
    it('returns Noop in development with a warning', () => {
      const logger = quietLogger();
      const signer = selectPadesSigner(makeEnv({}), tsaOff, logger);
      expect(signer).toBeInstanceOf(NoopPadesSigner);
      expect(logger.warns).toHaveLength(1);
    });

    it('throws in production without PDF_SIGNING_ALLOW_NOOP', () => {
      expect(() =>
        selectPadesSigner(makeEnv({ NODE_ENV: 'production' }), tsaOff, quietLogger()),
      ).toThrow(/PDF_SIGNING_ALLOW_NOOP=true/);
      expect(() =>
        selectPadesSigner(
          makeEnv({ NODE_ENV: 'production', PDF_SIGNING_ALLOW_NOOP: false }),
          tsaOff,
          quietLogger(),
        ),
      ).toThrow(/PDF_SIGNING_PROVIDER is not set/);
    });

    it('returns Noop in production when PDF_SIGNING_ALLOW_NOOP=true', () => {
      const signer = selectPadesSigner(
        makeEnv({ NODE_ENV: 'production', PDF_SIGNING_ALLOW_NOOP: true }),
        tsaOff,
        quietLogger(),
      );
      expect(signer).toBeInstanceOf(NoopPadesSigner);
    });

    it('ignores PDF_SIGNING_ALLOW_NOOP when a provider is set but broken', () => {
      expect(() =>
        selectPadesSigner(
          makeEnv({
            NODE_ENV: 'production',
            PDF_SIGNING_ALLOW_NOOP: true,
            PDF_SIGNING_PROVIDER: 'kms',
          }),
          tsaOff,
          quietLogger(),
        ),
      ).toThrow(/PDF_SIGNING_PROVIDER=kms/);
    });
  });
});
