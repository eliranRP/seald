#!/usr/bin/env node
// @ts-check
/**
 * Integration smoke test for the upload pipeline.
 *
 * Exercises magic-byte check → pdf-lib page count → SHA-256 → Supabase
 * upload → signed-URL download, against a real PDF and the real Supabase
 * bucket. Does NOT go through the HTTP layer (that's Task 11's e2e).
 *
 * Usage:
 *   pnpm --filter api smoke:upload -- <path-to-pdf>
 *
 * Example:
 *   pnpm --filter api smoke:upload -- ~/Downloads/example.pdf
 *
 * Cleanup: script removes the uploaded object after verification.
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDotenvIfPresent() {
  const p = resolve(__dirname, '..', '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);

async function main() {
  loadDotenvIfPresent();
  const inputPath = process.argv[2];
  if (!inputPath) die('usage: smoke-upload.mjs <path-to-pdf>');
  if (!existsSync(inputPath)) die(`pdf not found: ${inputPath}`);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.STORAGE_BUCKET ?? 'envelopes';
  if (!supabaseUrl) die('SUPABASE_URL missing');
  if (!serviceKey) die('SUPABASE_SERVICE_ROLE_KEY missing');

  const body = readFileSync(inputPath);
  console.log(`✓ loaded ${body.length} bytes from ${inputPath}`);

  // 1. Magic bytes
  if (!body.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) die('magic bytes fail — not a PDF');
  console.log('✓ magic bytes ok (%PDF-)');

  // 2. pdf-lib page count
  const doc = await PDFDocument.load(body, { updateMetadata: false, throwOnInvalidObject: true });
  const pages = doc.getPageCount();
  if (pages <= 0) die('pdf has 0 pages');
  console.log(`✓ pdf-lib parse ok — ${pages} pages`);

  // 3. SHA-256
  const sha256 = createHash('sha256').update(body).digest('hex');
  console.log(`✓ sha256 = ${sha256}`);
  if (sha256.length !== 64) die('sha256 format bogus');

  // 4. Upload to Storage
  const envelopeId = `smoke-${randomUUID()}`;
  const key = `${envelopeId}/original.pdf`;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const uploadUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}/${encodeURI(key)}`;
  const upRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: new Uint8Array(body),
  });
  if (!upRes.ok) die(`upload failed ${upRes.status}: ${await upRes.text()}`);
  console.log(`✓ uploaded to ${bucket}/${key}`);

  // 5. Verify via HEAD
  const headRes = await fetch(uploadUrl, { method: 'HEAD', headers });
  if (!headRes.ok) die(`HEAD after upload failed ${headRes.status}`);
  console.log(`✓ bucket contains the object (content-length ${headRes.headers.get('content-length')})`);

  // 6. Sign + re-download, verify bytes
  const signUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/sign/${bucket}/${encodeURI(key)}`;
  const signRes = await fetch(signUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!signRes.ok) die(`sign failed ${signRes.status}`);
  const { signedURL } = await signRes.json();
  const publicUrl = `${supabaseUrl.replace(/\/$/, '')}/storage/v1${signedURL}`;
  const dlRes = await fetch(publicUrl);
  if (!dlRes.ok) die(`signed-url download failed ${dlRes.status}`);
  const dlBody = Buffer.from(await dlRes.arrayBuffer());
  const dlSha = createHash('sha256').update(dlBody).digest('hex');
  if (dlSha !== sha256) die(`hash mismatch after round-trip: ${dlSha} !== ${sha256}`);
  console.log('✓ signed-URL download round-trip hash matches');

  // 7. Cleanup
  const delRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${bucket}`, {
    method: 'DELETE',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [key] }),
  });
  if (!delRes.ok) die(`cleanup delete failed ${delRes.status}`);
  console.log('✓ cleanup complete');
  console.log('\nALL GOOD ✓  — upload pipeline verified end-to-end against live Supabase');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
