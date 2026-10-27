import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Envelope, EnvelopeEvent } from '../../envelopes/envelope.entity';
import type { SignerAuditDetail } from '../../envelopes/envelopes.repository';
import { buildAuditPdf } from '../audit-pdf';

/**
 * User text in the audit trail (titles, file names, signer names) is
 * often Hebrew. Inter and Source Serif carry no Hebrew glyphs, so the
 * renderer falls back to Noto Sans Hebrew instead of printing garbage.
 */
const HEBREW_TITLE = 'לחצנים למיכלי הדחה';

describe('audit PDF with Hebrew text', () => {
  let fonts = '';
  let text = '';

  beforeAll(async () => {
    const input = makeInput({ sealed: true, senderName: 'אלירן' });
    const pdf = await buildAuditPdf({
      ...input,
      envelope: { ...input.envelope, title: `signed_(1) ${HEBREW_TITLE}` },
    });
    const dir = mkdtempSync(join(tmpdir(), 'audit-pdf-hebrew-'));
    const path = join(dir, 'audit.pdf');
    writeFileSync(path, pdf);
    fonts = spawnSync('pdffonts', [path], { encoding: 'utf8' }).stdout;
    text = spawnSync('pdftotext', ['-raw', path, '-'], { encoding: 'utf8' }).stdout;
  }, 120_000);

  it('embeds the Hebrew fallback font', () => {
    expect(fonts).toMatch(/NotoSansHebrew/);
  });

  it('prints every Hebrew word of the title', () => {
    for (const word of HEBREW_TITLE.split(' ')) {
      const reversed = [...word].reverse().join('');
      expect(text.includes(word) || text.includes(reversed)).toBe(true);
    }
  });
});

function makeInput(opts: {
  sealed: boolean;
  senderName: string | null;
  cmsSealApplied?: boolean;
  timestampApplied?: boolean;
}): {
  envelope: Envelope;
  events: ReadonlyArray<EnvelopeEvent>;
  signerDetails: ReadonlyArray<SignerAuditDetail>;
  sealedSha256: string | null;
  sealedPages: number | null;
  cmsSealApplied: boolean;
  timestampApplied: boolean;
  publicUrl: string;
} {
  const envelopeId = '11111111-1111-4111-8111-111111111111';
  const signerId = '22222222-2222-4222-8222-222222222222';
  const sealedSha256 = opts.sealed
    ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    : null;
  const envelope: Envelope = {
    id: envelopeId,
    owner_id: '33333333-3333-4333-8333-333333333333',
    title: 'Sample agreement',
    short_code: 'sampleCode013',
    status: opts.sealed ? 'completed' : 'declined',
    delivery_mode: 'parallel',
    original_pages: 2,
    original_sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    sealed_sha256: sealedSha256,
    sender_email: 'ada@example.com',
    sender_name: opts.senderName,
    sent_at: '2026-03-11T20:59:04.000Z',
    completed_at: opts.sealed ? '2026-03-11T21:21:25.000Z' : null,
    expires_at: '2026-04-11T20:59:03.000Z',
    tc_version: '2026-04-24',
    privacy_version: '2026-04-24',
    reminders_enabled: true,
    signers: [
      {
        id: signerId,
        email: 'sam@example.com',
        name: 'Sam Signer',
        color: '#4F46E5',
        role: 'signatory',
        signing_order: 1,
        status: opts.sealed ? 'completed' : 'declined',
        viewed_at: '2026-03-11T21:20:50.000Z',
        tc_accepted_at: '2026-03-11T21:20:54.000Z',
        signed_at: opts.sealed ? '2026-03-11T21:21:22.000Z' : null,
        declined_at: opts.sealed ? null : '2026-03-11T21:14:22.000Z',
      },
    ],
    fields: [],
    tags: [],
    created_at: '2026-03-11T20:59:03.000Z',
    updated_at: '2026-03-11T21:21:25.000Z',
  };
  const events: EnvelopeEvent[] = [
    {
      id: '44444444-4444-4444-8444-444444444444',
      envelope_id: envelopeId,
      signer_id: null,
      actor_kind: 'sender',
      event_type: 'created',
      ip: '203.0.113.10',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T20:59:03.000Z',
    },
    {
      id: '55555555-5555-4555-8555-555555555555',
      envelope_id: envelopeId,
      signer_id: null,
      actor_kind: 'sender',
      event_type: 'sent',
      ip: '203.0.113.10',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T20:59:04.000Z',
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      envelope_id: envelopeId,
      signer_id: signerId,
      actor_kind: 'signer',
      event_type: opts.sealed ? 'signed' : 'declined',
      ip: '203.0.113.20',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: opts.sealed ? '2026-03-11T21:21:22.000Z' : '2026-03-11T21:14:22.000Z',
    },
  ];
  const signerDetails: SignerAuditDetail[] = [
    {
      signer_id: signerId,
      signature_format: 'typed',
      signature_font: 'Caveat',
      verification_checks: ['email'],
      signing_ip: '203.0.113.20',
    },
  ];
  return {
    envelope,
    events,
    signerDetails,
    sealedSha256,
    sealedPages: opts.sealed ? 2 : null,
    cmsSealApplied: opts.cmsSealApplied ?? opts.sealed,
    timestampApplied: opts.timestampApplied ?? opts.cmsSealApplied ?? opts.sealed,
    publicUrl: 'https://seald.example',
  };
}
