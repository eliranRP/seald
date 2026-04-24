/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

/**
 * Dev helper: invokes POST /internal/cron/flush-emails on the running API
 * instance to drain the `outbound_emails` queue. Reads `CRON_SECRET` +
 * `PORT` from `apps/api/.env`.
 *
 * Usage: `pnpm --filter api flush:emails`
 *
 * Handy when EMAIL_PROVIDER=logging — writes files to `.seald-mail/` and
 * prints the sign URL to server logs without waiting on the scheduled cron.
 */

function loadDotenv(): void {
  const raw = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotenv();

function postJson(
  urlStr: string,
  headers: Record<string, string>,
): Promise<{
  status: number;
  body: unknown;
}> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const lib = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = lib(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'content-type': 'application/json',
          'content-length': '0',
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const txt = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(txt) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: txt });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function main(): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('CRON_SECRET missing from apps/api/.env');
  const port = process.env.PORT ?? '3000';
  const url = `http://localhost:${port}/internal/cron/flush-emails`;
  console.log(`POST ${url}`);
  const { status, body } = await postJson(url, { 'x-cron-secret': secret });
  console.log(`status: ${status}`);
  console.log(JSON.stringify(body, null, 2));
  if (status !== 200) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
