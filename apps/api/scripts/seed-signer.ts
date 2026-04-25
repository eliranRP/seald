/* eslint-disable no-console */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';

// Load `apps/api/.env` so the script can be run standalone without piping
// `source .env`. Keeps the expected dev ergonomics: `pnpm seed:signer`.
function loadDotenv(): void {
  try {
    // `__dirname` works because tsconfig targets CommonJS.
    const envPath = join(__dirname, '..', '.env');
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env is optional — the script will throw with a friendlier message
    // below if DATABASE_URL is still missing.
  }
}
loadDotenv();

/**
 * Seed a signer-ready envelope directly in Postgres and print the recipient
 * URL (including the opaque `?t=` token) so a developer can paste it into
 * the browser and walk the full recipient flow end-to-end without going
 * through the authenticated sender surface.
 *
 * Usage:
 *   pnpm --filter api exec tsx scripts/seed-signer.ts
 *
 * Requires `DATABASE_URL` in the environment (reads apps/api/.env via the
 * Nest bootstrap in normal dev, but this script reads `process.env`
 * directly — run it after sourcing the env file or inline the var).
 *
 * The script is idempotent *per run*: every invocation generates fresh UUIDs
 * + a new short code + a fresh token, and inserts a new envelope row. Old
 * seed rows accumulate; clean them periodically with:
 *   delete from public.envelopes where title = 'SEED test envelope';
 */

const SHORT_CODE_ALPHABET = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const SHORT_CODE_LENGTH = 13;

function generateShortCode(): string {
  let id = '';
  const buf = randomBytes(SHORT_CODE_LENGTH);
  for (let i = 0; i < SHORT_CODE_LENGTH; i += 1) {
    id += SHORT_CODE_ALPHABET[buf[i]! % SHORT_CODE_ALPHABET.length];
  }
  return id;
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Run `source apps/api/.env` first.');
  }

  const publicUrl = process.env.APP_PUBLIC_URL ?? 'http://localhost:5173';
  const tcVersion = process.env.TC_VERSION ?? new Date().toISOString().slice(0, 10);
  const privacyVersion = process.env.PRIVACY_VERSION ?? tcVersion;

  // Strip sslmode= from the connection string so pg's SSL config (below)
  // is the single source of truth. Recent pg versions treat `sslmode=require`
  // as equivalent to `verify-full`, which fails on Supabase's self-signed
  // certificate chain. For a dev seed script we accept the chain blindly —
  // this is fine for a developer's machine + dev envelope; production code
  // uses a different path (the Nest DbModule, configured with a proper CA).
  const sanitized = databaseUrl
    .replace(/[?&]sslmode=[^&]+/g, '')
    .replace(/\?&/, '?')
    .replace(/\?$/, '');

  const client = new Client({
    connectionString: sanitized,
    ssl: sanitized.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    // 1. Reuse or create a throw-away owner in auth.users. We pick a fixed
    //    sentinel email so repeated seeding doesn't flood the auth table.
    const OWNER_EMAIL = 'seed-owner@seald.dev';
    const ownerResult = await client.query<{ id: string }>(
      `select id from auth.users where email = $1 limit 1`,
      [OWNER_EMAIL],
    );
    let ownerId = ownerResult.rows[0]?.id;
    if (!ownerId) {
      ownerId = randomUUID();
      await client.query(
        `insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
         values ($1, $2, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`,
        [ownerId, OWNER_EMAIL],
      );
      console.log(`Created seed owner ${OWNER_EMAIL} (${ownerId})`);
    }

    // 2. Envelope.
    const envelopeId = randomUUID();
    const shortCode = generateShortCode();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days
    await client.query(
      `insert into public.envelopes (
         id, owner_id, title, short_code, status, delivery_mode,
         original_pages, tc_version, privacy_version, sent_at, expires_at,
         sender_email, sender_name
       ) values (
         $1, $2, 'SEED test envelope', $3, 'awaiting_others', 'parallel',
         2, $4, $5, now(), $6, $7, $8
       )`,
      [
        envelopeId,
        ownerId,
        shortCode,
        tcVersion,
        privacyVersion,
        expiresAt,
        'sender@seald.dev',
        'Eliran Azulay',
      ],
    );

    // 3. Signer with a fresh access token.
    const signerId = randomUUID();
    const token = generateToken();
    const tokenHash = hashToken(token);
    await client.query(
      `insert into public.envelope_signers (
         id, envelope_id, email, name, color, role, signing_order,
         access_token_hash, access_token_sent_at
       ) values (
         $1, $2, $3, $4, $5, 'signatory', 1, $6, now()
       )`,
      [
        signerId,
        envelopeId,
        process.env.RECIPIENT_EMAIL ?? 'maya+seed@seald.dev',
        process.env.RECIPIENT_NAME ?? 'Maya Raskin',
        '#10B981',
        tokenHash,
      ],
    );

    // 4. Two fields on two pages so the fill page is non-trivial.
    await client.query(
      `insert into public.envelope_fields
         (envelope_id, signer_id, kind, page, x, y, width, height, required, link_id)
       values
         ($1, $2, 'text',      1, 0.10, 0.40, 0.45, 0.05, true, 'Job title'),
         ($1, $2, 'signature', 2, 0.10, 0.80, 0.40, 0.08, true, null)`,
      [envelopeId, signerId],
    );

    // 5. Created + sent events so the audit trail has a lineage.
    const evRows = await client.query<{ id: string; event_type: string }>(
      `insert into public.envelope_events (envelope_id, signer_id, actor_kind, event_type, metadata)
       values
         ($1, null, 'system', 'created', '{"seed":true}'::jsonb),
         ($1, $2,   'system', 'sent',    '{"seed":true}'::jsonb)
       returning id, event_type`,
      [envelopeId, signerId],
    );
    const sentEventId = evRows.rows.find((r) => r.event_type === 'sent')?.id ?? null;

    const signerUrl = `${publicUrl}/sign/${envelopeId}?t=${token}`;
    const verifyUrl = `${publicUrl}/verify/${shortCode}`;

    // 6. Enqueue the invite email so `pnpm flush:emails` has something to
    //    push through Resend. Mirrors the payload schema EnvelopesService
    //    uses at real send time; the unique key
    //    `(envelope_id, signer_id, kind, source_event_id)` is satisfied
    //    because every seed has a fresh event id.
    await client.query(
      `insert into public.outbound_emails
         (envelope_id, signer_id, kind, to_email, to_name, payload, source_event_id)
       values ($1, $2, 'invite', $3, $4, $5::jsonb, $6)`,
      [
        envelopeId,
        signerId,
        process.env.RECIPIENT_EMAIL ?? 'maya+seed@seald.dev',
        process.env.RECIPIENT_NAME ?? 'Maya Raskin',
        JSON.stringify({
          sender_name: 'Eliran Azulay',
          sender_email: 'sender@seald.dev',
          envelope_title: 'SEED test envelope',
          sign_url: signerUrl,
          verify_url: verifyUrl,
          short_code: shortCode,
          public_url: publicUrl,
        }),
        sentEventId,
      ],
    );
    console.log('\n=============================================');
    console.log('SEED ENVELOPE READY');
    console.log('=============================================');
    console.log(`envelope_id : ${envelopeId}`);
    console.log(`short_code  : ${shortCode}`);
    console.log(`signer_id   : ${signerId}`);
    console.log(`signer url  : ${signerUrl}`);
    console.log('=============================================\n');
    console.log('Paste the signer URL into a browser to walk the recipient flow.');
    console.log('The token is single-use — a fresh seed is required after submit/decline.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
