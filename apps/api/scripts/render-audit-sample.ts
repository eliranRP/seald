/**
 * Renders a sample audit PDF from hand-built envelope + events data that
 * mirrors a realistic production flow. Produces two outputs under
 * `/tmp/audit-sample/`:
 *
 *   completed.pdf — single signer completed, sealed, full 4-page trail.
 *   declined.pdf  — single signer declined, audit_only variant (no sealed
 *                   hash — page 1 renders "Not applicable (unsealed)").
 *
 * Run with: pnpm --filter api tsx scripts/render-audit-sample.ts
 *
 * The script stays inside `apps/api/scripts` (ts-node friendly via tsx) so
 * it is distinct from the Jest unit tests — this is a developer preview
 * harness, not a regression gate.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildAuditPdf } from '../src/sealing/audit-pdf';
import type { Envelope, EnvelopeEvent } from '../src/envelopes/envelope.entity';
import type { SignerAuditDetail } from '../src/envelopes/envelopes.repository';

const OUT_DIR = '/tmp/audit-sample';

function makeCompletedEnvelope(): {
  envelope: Envelope;
  events: ReadonlyArray<EnvelopeEvent>;
  signerDetails: ReadonlyArray<SignerAuditDetail>;
  sealedSha256: string;
} {
  const envelopeId = '33b9416b-ad2a-4f83-9cb2-69f87aa1655c';
  const ownerId = '0e5e0db9-bb9a-4cc1-9ea3-9cfac3118d69';
  const signerId = '16c9fdef-4785-4d9d-ad95-e47b6ae960b9';

  const envelope: Envelope = {
    id: envelopeId,
    owner_id: ownerId,
    title: 'UNCONDITIONAL FINAL WAIVER — 11.03.2026',
    short_code: 'qyHWxhRGhmzjJ',
    status: 'completed',
    delivery_mode: 'parallel',
    original_pages: 7,
    original_sha256: 'a2e35edd7a531f4928f7f56c4b4e33674a0939f9a120359185e24a0c55f675ee',
    sealed_sha256: '7a8afa33b5b077e0486f08fc301e6865caf7b8ea0ea256505df80ea6034c1261',
    sender_email: 'ops@nromomentum.com',
    sender_name: 'Ops Ops',
    sent_at: '2026-03-11T20:59:04.000Z',
    completed_at: '2026-03-11T21:21:25.000Z',
    expires_at: '2026-04-11T20:59:03.000Z',
    tc_version: '2025-08-01',
    privacy_version: '2025-08-01',
    signers: [
      {
        id: signerId,
        email: 'bapstarremodelingllc502@gmail.com',
        name: 'Benjamin Antonio Perez',
        color: '#4F46E5',
        role: 'signatory',
        signing_order: 1,
        status: 'completed',
        viewed_at: '2026-03-11T21:20:50.000Z',
        tc_accepted_at: '2026-03-11T21:20:54.000Z',
        signed_at: '2026-03-11T21:21:22.000Z',
        declined_at: null,
      },
    ],
    fields: [],
    created_at: '2026-03-11T20:59:03.000Z',
    updated_at: '2026-03-11T21:21:25.000Z',
  };

  const events: EnvelopeEvent[] = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      envelope_id: envelopeId,
      signer_id: null,
      actor_kind: 'sender',
      event_type: 'created',
      ip: '200.114.112.140',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T20:59:03.000Z',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      envelope_id: envelopeId,
      signer_id: null,
      actor_kind: 'sender',
      event_type: 'sent',
      ip: '200.114.112.140',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T20:59:04.000Z',
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      envelope_id: envelopeId,
      signer_id: signerId,
      actor_kind: 'signer',
      event_type: 'viewed',
      ip: '4.28.55.97',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T21:20:50.000Z',
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      envelope_id: envelopeId,
      signer_id: signerId,
      actor_kind: 'signer',
      event_type: 'tc_accepted',
      ip: '4.28.55.97',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T21:20:54.000Z',
    },
    {
      id: '55555555-5555-5555-5555-555555555555',
      envelope_id: envelopeId,
      signer_id: signerId,
      actor_kind: 'signer',
      event_type: 'signed',
      ip: '4.28.55.97',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T21:21:22.000Z',
    },
    {
      id: '66666666-6666-6666-6666-666666666666',
      envelope_id: envelopeId,
      signer_id: null,
      actor_kind: 'system',
      event_type: 'all_signed',
      ip: null,
      user_agent: null,
      metadata: {},
      created_at: '2026-03-11T21:21:23.000Z',
    },
    {
      id: '77777777-7777-7777-7777-777777777777',
      envelope_id: envelopeId,
      signer_id: null,
      actor_kind: 'system',
      event_type: 'sealed',
      ip: null,
      user_agent: null,
      metadata: {},
      created_at: '2026-03-11T21:21:25.000Z',
    },
  ];

  const signerDetails: SignerAuditDetail[] = [
    {
      signer_id: signerId,
      signature_format: 'typed',
      signature_font: 'Caveat',
      verification_checks: ['email'],
      signing_ip: '4.28.55.97',
    },
  ];

  return {
    envelope,
    events,
    signerDetails,
    sealedSha256: envelope.sealed_sha256!,
  };
}

function makeDeclinedEnvelope() {
  const completed = makeCompletedEnvelope();
  const env: Envelope = {
    ...completed.envelope,
    id: '9f0d4b71-ccc1-49a1-ab74-cdb8e9a8b001',
    short_code: 'DGH77qMAZ4qyL',
    status: 'declined',
    sealed_sha256: null,
    completed_at: null,
    updated_at: '2026-03-11T21:15:00.000Z',
    signers: [
      {
        ...completed.envelope.signers[0]!,
        status: 'declined',
        signed_at: null,
        declined_at: '2026-03-11T21:14:22.000Z',
      },
    ],
  };
  const events: EnvelopeEvent[] = [
    completed.events[0]!,
    completed.events[1]!,
    completed.events[2]!,
    completed.events[3]!,
    {
      id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      envelope_id: env.id,
      signer_id: env.signers[0]!.id,
      actor_kind: 'signer',
      event_type: 'declined',
      ip: '4.28.55.97',
      user_agent: 'Mozilla/5.0',
      metadata: { reason: 'Terms need review by counsel' },
      created_at: '2026-03-11T21:14:22.000Z',
    },
  ].map((e) => ({ ...e, envelope_id: env.id }));
  const signerDetails: SignerAuditDetail[] = [
    {
      signer_id: env.signers[0]!.id,
      signature_format: null,
      signature_font: null,
      verification_checks: ['email'],
      signing_ip: null,
    },
  ];
  return { envelope: env, events, signerDetails, sealedSha256: null };
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const completed = makeCompletedEnvelope();
  const declined = makeDeclinedEnvelope();

  const publicUrl = 'https://seald.nromomentum.com';
  const completedPdf = await buildAuditPdf({
    envelope: completed.envelope,
    events: completed.events,
    signerDetails: completed.signerDetails,
    sealedSha256: completed.sealedSha256,
    publicUrl,
  });
  writeFileSync(`${OUT_DIR}/completed.pdf`, completedPdf);

  const declinedPdf = await buildAuditPdf({
    envelope: declined.envelope,
    events: declined.events,
    signerDetails: declined.signerDetails,
    sealedSha256: declined.sealedSha256,
    publicUrl,
  });
  writeFileSync(`${OUT_DIR}/declined.pdf`, declinedPdf);

  console.log(`Wrote:`);
  console.log(`  ${OUT_DIR}/completed.pdf  (${completedPdf.length.toLocaleString()} bytes)`);
  console.log(`  ${OUT_DIR}/declined.pdf  (${declinedPdf.length.toLocaleString()} bytes)`);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
