/* eslint-disable */
/**
 * Operator helper: render representative audit-trail PDFs to
 * `apps/api/test-output/`. Run via:
 *   pnpm --filter api build && node apps/api/scripts/render-audit-samples.cjs
 *
 * The samples cover the variants the renderer must handle without
 * cut-off / overflow:
 *   - completed (multi-signer)
 *   - completed (single signer)
 *   - declined
 *   - long title (wrap stress)
 */
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

(async () => {
  const { buildAuditPdf } = require('../dist/src/sealing/audit-pdf');

  const OUT_DIR = join(__dirname, '..', 'test-output');
  mkdirSync(OUT_DIR, { recursive: true });

  const envelopeId = '33b9416b-ad2a-4f83-9cb2-69f87aa1655c';
  const s1 = '16c9fdef-4785-4d9d-ad95-e47b6ae960b9';
  const s2 = '2a1b4c7d-9999-4eee-b8a0-444555666777';

  const ev = (id, signer_id, actor, type, created_at) => ({
    id,
    envelope_id: envelopeId,
    signer_id,
    actor_kind: actor,
    event_type: type,
    ip: actor === 'signer' ? '4.28.55.97' : '200.114.112.140',
    user_agent: 'Mozilla/5.0',
    metadata: {},
    created_at,
  });

  const baseEnvelope = {
    id: envelopeId,
    owner_id: '0e5e0db9-bb9a-4cc1-9ea3-9cfac3118d69',
    title: 'UNCONDITIONAL FINAL WAIVER — 11.03.2026',
    short_code: 'qyHWxhRGhmzjJ',
    status: 'completed',
    delivery_mode: 'parallel',
    original_pages: 7,
    original_sha256: 'a2e35edd7a531f4928f7f56c4b4e33674a0939f9a120359185e24a0c55f675ee',
    sealed_sha256: '7a8afa33b5b077e0486f08fc301e6865caf7b8ea0ea256505df80ea6034c1261',
    sender_email: 'ops@nromomentum.com',
    sender_name: 'Ops Team',
    sent_at: '2026-03-11T20:59:04.000Z',
    completed_at: '2026-03-11T21:21:25.000Z',
    expires_at: '2026-04-11T20:59:03.000Z',
    tc_version: '2025-08-01',
    privacy_version: '2025-08-01',
    signers: [
      {
        id: s1,
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
      {
        id: s2,
        email: 'agent.smith@example-realty.com',
        name: 'Agent Smith',
        color: '#0EA5E9',
        role: 'signatory',
        signing_order: 2,
        status: 'completed',
        viewed_at: '2026-03-11T21:14:30.000Z',
        tc_accepted_at: '2026-03-11T21:14:38.000Z',
        signed_at: '2026-03-11T21:21:25.000Z',
        declined_at: null,
      },
    ],
    fields: [],
    created_at: '2026-03-11T20:59:03.000Z',
    updated_at: '2026-03-11T21:21:25.000Z',
  };

  const baseEvents = [
    ev('1', null, 'sender', 'created', '2026-03-11T20:59:03.000Z'),
    ev('2', null, 'sender', 'sent', '2026-03-11T20:59:04.000Z'),
    ev('3', s1, 'signer', 'viewed', '2026-03-11T21:20:50.000Z'),
    ev('4', s1, 'signer', 'tc_accepted', '2026-03-11T21:20:54.000Z'),
    ev('5', s1, 'signer', 'field_filled', '2026-03-11T21:21:00.000Z'),
    ev('6', s1, 'signer', 'signed', '2026-03-11T21:21:22.000Z'),
    ev('7', s2, 'signer', 'viewed', '2026-03-11T21:14:30.000Z'),
    ev('8', s2, 'signer', 'tc_accepted', '2026-03-11T21:14:38.000Z'),
    ev('9', s2, 'signer', 'signed', '2026-03-11T21:21:25.000Z'),
    ev('10', null, 'system', 'all_signed', '2026-03-11T21:21:25.000Z'),
    ev('11', null, 'system', 'sealed', '2026-03-11T21:21:25.000Z'),
  ];

  const details = [
    { signer_id: s1, signature_format: 'drawn', signature_font: null, verification_checks: ['email'], signing_ip: '4.28.55.97' },
    { signer_id: s2, signature_format: 'typed', signature_font: 'Helvetica', verification_checks: ['email'], signing_ip: '5.10.20.30' },
  ];

  const PUBLIC = 'https://seald.nromomentum.com';

  // Variant A — completed multi-signer
  let buf = await buildAuditPdf({ envelope: baseEnvelope, events: baseEvents, signerDetails: details, sealedSha256: baseEnvelope.sealed_sha256, sealedPages: 9, publicUrl: PUBLIC });
  writeFileSync(join(OUT_DIR, 'audit-sample-completed.pdf'), buf);
  console.log('audit-sample-completed.pdf', buf.byteLength, 'bytes');

  // Variant B — single signer
  const single = { ...baseEnvelope, signers: [baseEnvelope.signers[0]] };
  const singleEv = baseEvents.filter((e) => e.signer_id !== s2 && e.event_type !== 'all_signed');
  buf = await buildAuditPdf({ envelope: single, events: singleEv, signerDetails: [details[0]], sealedSha256: baseEnvelope.sealed_sha256, sealedPages: 9, publicUrl: PUBLIC });
  writeFileSync(join(OUT_DIR, 'audit-sample-single.pdf'), buf);
  console.log('audit-sample-single.pdf', buf.byteLength, 'bytes');

  // Variant C — declined
  const declined = {
    ...baseEnvelope,
    status: 'declined',
    sealed_sha256: null,
    completed_at: null,
    signers: [
      { ...baseEnvelope.signers[0], status: 'declined', signed_at: null, declined_at: '2026-03-11T21:21:00.000Z' },
      baseEnvelope.signers[1],
    ],
  };
  const decEvents = baseEvents
    .filter((e) => e.event_type !== 'signed' && e.event_type !== 'all_signed' && e.event_type !== 'sealed')
    .concat([ev('99', s1, 'signer', 'declined', '2026-03-11T21:21:00.000Z')]);
  buf = await buildAuditPdf({ envelope: declined, events: decEvents, signerDetails: details, sealedSha256: null, sealedPages: null, publicUrl: PUBLIC });
  writeFileSync(join(OUT_DIR, 'audit-sample-declined.pdf'), buf);
  console.log('audit-sample-declined.pdf', buf.byteLength, 'bytes');

  // Variant D — long title
  const longTitle = {
    ...baseEnvelope,
    title:
      'MASTER SERVICES AGREEMENT — Statement of Work #14 — NRO Momentum LLC and Acme Construction Holdings Co. — Phase II Renovation, 2026',
  };
  buf = await buildAuditPdf({ envelope: longTitle, events: baseEvents, signerDetails: details, sealedSha256: baseEnvelope.sealed_sha256, sealedPages: 9, publicUrl: PUBLIC });
  writeFileSync(join(OUT_DIR, 'audit-sample-long-title.pdf'), buf);
  console.log('audit-sample-long-title.pdf', buf.byteLength, 'bytes');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
