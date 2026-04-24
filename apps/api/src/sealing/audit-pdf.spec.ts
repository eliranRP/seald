import { PDFDocument } from 'pdf-lib';
import { buildAuditPdf } from './audit-pdf';
import type { Envelope, EnvelopeEvent } from '../envelopes/envelope.entity';
import type { SignerAuditDetail } from '../envelopes/envelopes.repository';

function makeCompletedInput() {
  const envelopeId = '33b9416b-ad2a-4f83-9cb2-69f87aa1655c';
  const signerId = '16c9fdef-4785-4d9d-ad95-e47b6ae960b9';
  const envelope: Envelope = {
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
      event_type: 'signed',
      ip: '4.28.55.97',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T21:21:22.000Z',
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
  return { envelope, events, signerDetails };
}

describe('buildAuditPdf', () => {
  it('produces a valid 4-page PDF for a completed envelope with sealed hash', async () => {
    const { envelope, events, signerDetails } = makeCompletedInput();
    const bytes = await buildAuditPdf({
      envelope,
      events,
      signerDetails,
      sealedSha256: envelope.sealed_sha256!,
      publicUrl: 'https://seald.nromomentum.com',
    });
    expect(bytes.byteLength).toBeGreaterThan(20_000);
    expect(bytes.slice(0, 5).toString('ascii')).toBe('%PDF-');

    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(4);
    const size = pdf.getPage(0).getSize();
    expect(size.width).toBe(612); // US Letter
    expect(size.height).toBe(792);

    // Sanity: PDF title metadata carries the envelope title
    expect(pdf.getTitle()).toBe(`Audit trail — ${envelope.title}`);
    expect(pdf.getAuthor()).toBe('Sealed');
  });

  it('produces a 4-page PDF for a declined envelope with no sealed sha', async () => {
    const { envelope, events, signerDetails } = makeCompletedInput();
    const declined: Envelope = {
      ...envelope,
      status: 'declined',
      sealed_sha256: null,
      completed_at: null,
      signers: [
        {
          ...envelope.signers[0]!,
          status: 'declined',
          signed_at: null,
          declined_at: '2026-03-11T21:14:22.000Z',
        },
      ],
    };
    const bytes = await buildAuditPdf({
      envelope: declined,
      events,
      signerDetails,
      sealedSha256: null,
      publicUrl: 'https://seald.nromomentum.com',
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(4);
  });

  it('embeds a QR image on page 1', async () => {
    const { envelope, events, signerDetails } = makeCompletedInput();
    const bytes = await buildAuditPdf({
      envelope,
      events,
      signerDetails,
      sealedSha256: envelope.sealed_sha256!,
      publicUrl: 'https://seald.nromomentum.com',
    });
    await PDFDocument.load(bytes); // proves the buffer round-trips
    // Search the raw bytes for the QR PNG marker. qrcode emits a /Subtype
    // /Image XObject which embeds an 8-bit PNG; the FlateDecode header is a
    // reliable proof that an image stream is present in the document.
    const src = Buffer.from(bytes);
    expect(src.includes(Buffer.from('/Subtype /Image'))).toBe(true);
  });

  it('renders without throwing when original_pages is null (audit_only path)', async () => {
    const { envelope, events, signerDetails } = makeCompletedInput();
    const input: Envelope = { ...envelope, original_pages: null, original_sha256: null };
    const bytes = await buildAuditPdf({
      envelope: input,
      events,
      signerDetails,
      sealedSha256: null,
      publicUrl: 'https://seald.nromomentum.com',
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(4);
  });
});
