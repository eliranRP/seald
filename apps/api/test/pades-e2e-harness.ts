import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
import type { FeatureFlag } from 'shared';

/**
 * Shared PAdES e2e fixtures (extracted from sealing-hardening.e2e-spec.ts
 * for WP-03): a throwaway P12 from openssl, an in-process RFC 3161 TSA,
 * and the runtime feature-flag override.
 */

export const TS_NODE_BIN = require.resolve('ts-node/dist/bin.js');

export function tryGenerateP12(): { path: string; password: string } | null {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
  } catch {
    return null;
  }
  const dir = mkdtempSync(join(tmpdir(), 'seald-wp01-'));
  const keyPath = join(dir, 'key.pem');
  const crtPath = join(dir, 'cert.pem');
  const p12Path = join(dir, 'bundle.p12');
  const password = 'testpass';
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-sha256',
      '-days',
      '30',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      crtPath,
      '-subj',
      '/C=US/O=Seald Test/CN=seald-wp01',
    ],
    { stdio: 'ignore' },
  );
  execFileSync(
    'openssl',
    [
      'pkcs12',
      '-export',
      '-inkey',
      keyPath,
      '-in',
      crtPath,
      '-out',
      p12Path,
      '-name',
      'seald-wp01',
      '-passout',
      `pass:${password}`,
    ],
    { stdio: 'ignore' },
  );
  return { path: p12Path, password };
}

/**
 * RFC 3161 TimeStampResp whose TSTInfo echoes the requested imprint. The
 * token is not signed (no signerInfos); the PAdES checks under test are
 * structural (placement, byte range, imprint), not TSA trust.
 */
function buildFakeTsaResponse(messageImprint: Buffer): Buffer {
  const asn1 = forge.asn1;
  const U = asn1.Class.UNIVERSAL;
  const T = asn1.Type;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const genTime = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const tstInfo = asn1.create(U, T.SEQUENCE, true, [
    asn1.create(U, T.INTEGER, false, String.fromCharCode(1)),
    asn1.create(U, T.OID, false, asn1.oidToDer('1.2.3.4.5.6').getBytes()),
    asn1.create(U, T.SEQUENCE, true, [
      asn1.create(U, T.SEQUENCE, true, [
        asn1.create(U, T.OID, false, asn1.oidToDer('2.16.840.1.101.3.4.2.1').getBytes()),
        asn1.create(U, T.NULL, false, ''),
      ]),
      asn1.create(U, T.OCTETSTRING, false, messageImprint.toString('binary')),
    ]),
    asn1.create(U, T.INTEGER, false, randomBytes(4).toString('binary')),
    asn1.create(U, T.GENERALIZEDTIME, false, genTime),
  ]);
  const signedData = asn1.create(U, T.SEQUENCE, true, [
    asn1.create(U, T.INTEGER, false, String.fromCharCode(3)),
    asn1.create(U, T.SET, true, []),
    asn1.create(U, T.SEQUENCE, true, [
      asn1.create(U, T.OID, false, asn1.oidToDer('1.2.840.113549.1.9.16.1.4').getBytes()),
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
        asn1.create(U, T.OCTETSTRING, false, asn1.toDer(tstInfo).getBytes()),
      ]),
    ]),
    asn1.create(U, T.SET, true, []),
  ]);
  const token = asn1.create(U, T.SEQUENCE, true, [
    asn1.create(U, T.OID, false, asn1.oidToDer('1.2.840.113549.1.7.2').getBytes()),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData]),
  ]);
  const resp = asn1.create(U, T.SEQUENCE, true, [
    asn1.create(U, T.SEQUENCE, true, [asn1.create(U, T.INTEGER, false, String.fromCharCode(0))]),
    token,
  ]);
  return Buffer.from(asn1.toDer(resp).getBytes(), 'binary');
}

export function startFakeTsa(): Promise<{ url: string; server: Server; hits: number[] }> {
  const hits: number[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      hits.push(Date.now());
      try {
        const tsq = forge.asn1.fromDer(Buffer.concat(chunks).toString('binary'));
        const mi = ((tsq.value as forge.asn1.Asn1[])[1]!.value as forge.asn1.Asn1[])[1]!;
        const imprint = Buffer.from(mi.value as unknown as string, 'binary');
        res.writeHead(200, { 'Content-Type': 'application/timestamp-reply' });
        res.end(buildFakeTsaResponse(imprint));
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('bad_tsa_request');
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${addr.port}`, server, hits });
    });
  });
}

export function setFlag(flag: FeatureFlag, on: boolean | undefined): void {
  const host = globalThis as unknown as {
    __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> | undefined;
  };
  const next = { ...host.__SEALD_FEATURE_OVERRIDES__ };
  if (on === undefined) delete next[flag];
  else next[flag] = on;
  host.__SEALD_FEATURE_OVERRIDES__ = next;
}
