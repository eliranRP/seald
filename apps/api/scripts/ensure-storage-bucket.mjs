#!/usr/bin/env node
// @ts-check
/**
 * Idempotent provisioner for the Supabase Storage bucket used by envelopes.
 *
 * Runs against whatever Supabase project the caller's env points at. Safe to
 * re-run: if the bucket already exists, prints a notice and exits 0.
 *
 * Usage:
 *   pnpm --filter api storage:init
 *
 * Env required:
 *   SUPABASE_URL              — e.g. https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — service_role JWT (NEVER commit)
 *   STORAGE_BUCKET            — optional, defaults to "envelopes"
 *
 * Env loaded from apps/api/.env automatically in dev. In CI/prod pass vars directly.
 *
 * Why this script exists:
 * - Consistent setup across dev + CI + prod — one command, idempotent, no
 *   dashboard clicks.
 * - Encodes the bucket policy we want (private, 50 MB, no MIME restriction —
 *   per-endpoint validation enforces PDF vs PNG) in a single reviewable place.
 * - Prod deploys run this as a boot step; drift from expected config surfaces
 *   as a diff.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load KEY=VALUE pairs from apps/api/.env into process.env if present. */
function loadDotenvIfPresent() {
  const envPath = resolve(__dirname, '..', '.env');
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    const value = trimmed.slice(eq + 1).trim();
    process.env[key] = value;
  }
}

function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

const BUCKET_CONFIG = Object.freeze({
  public: false,
  file_size_limit: 52_428_800, // 50 MB — accommodates sealed PDFs after audit-page append + crypto padding
  allowed_mime_types: null, // per-endpoint magic-byte check handles this (PDF for originals, PNG for signatures)
});

async function main() {
  loadDotenvIfPresent();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucketId = process.env.STORAGE_BUCKET ?? 'envelopes';

  if (!supabaseUrl) die('SUPABASE_URL is not set');
  if (!serviceKey) die('SUPABASE_SERVICE_ROLE_KEY is not set (expected service_role JWT, never the anon key)');

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // 1. Check if bucket already exists.
  const getRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${bucketId}`, { headers });
  if (getRes.ok) {
    const existing = await getRes.json();
    console.log(`✓ bucket '${bucketId}' already exists (public=${existing.public}, size_limit=${existing.file_size_limit})`);
    return;
  }
  if (getRes.status !== 404) {
    const body = await getRes.text();
    die(`unexpected ${getRes.status} when probing bucket: ${body}`);
  }

  // 2. Create.
  const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: bucketId, name: bucketId, ...BUCKET_CONFIG }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    die(`failed to create bucket: ${createRes.status} ${body}`);
  }
  console.log(`✓ bucket '${bucketId}' created`);
  console.log(`  public: ${BUCKET_CONFIG.public}`);
  console.log(`  file_size_limit: ${BUCKET_CONFIG.file_size_limit} bytes (${BUCKET_CONFIG.file_size_limit / 1_048_576} MB)`);
  console.log(`  allowed_mime_types: <any> (per-endpoint validation enforces)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
