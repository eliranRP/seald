import { generateKeyPairSync } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import forge from 'node-forge';

/** A received request, as the receiver saw it (raw body bytes included). */
export interface ReceivedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingMessage['headers'];
  readonly rawBody: string;
  readonly servername?: string;
}

export type ReceiverHandler = (req: ReceivedRequest, res: ServerResponse) => void;

export interface TestReceiver {
  readonly port: number;
  readonly received: ReceivedRequest[];
  setHandler(h: ReceiverHandler): void;
  close(): Promise<void>;
}

/** Self-signed certificate for `hostname`, for the HTTPS receiver. */
export function selfSignedCert(hostname: string): { key: string; cert: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.publicKeyFromPem(pubPem);
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  const attrs = [{ name: 'commonName', value: hostname }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] },
  ]);
  cert.sign(forge.pki.privateKeyFromPem(keyPem), forge.md.sha256.create());
  return { key: keyPem, cert: forge.pki.certificateToPem(cert) };
}

/**
 * Local webhook receiver bound to 127.0.0.1 on an ephemeral port. Plain
 * HTTP unless `tls` is given. Records every request it gets.
 */
export async function startReceiver(tls?: { key: string; cert: string }): Promise<TestReceiver> {
  const received: ReceivedRequest[] = [];
  let handler: ReceiverHandler = (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  };
  const onRequest = (req: IncomingMessage, res: ServerResponse): void => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const servername = (req.socket as { servername?: string | false }).servername;
      const r: ReceivedRequest = {
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        rawBody: Buffer.concat(chunks).toString('utf8'),
        ...(typeof servername === 'string' ? { servername } : {}),
      };
      received.push(r);
      handler(r, res);
    });
  };
  const server: Server = tls ? createHttpsServer(tls, onRequest) : createServer(onRequest);
  const sockets = new Set<import('node:net').Socket>();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  server.on('secureConnection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    received,
    setHandler(h) {
      handler = h;
    },
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}
