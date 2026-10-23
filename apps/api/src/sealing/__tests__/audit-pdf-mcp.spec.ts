import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Envelope, EnvelopeEvent } from '../../envelopes/envelope.entity';
import type { SignerAuditDetail } from '../../envelopes/envelopes.repository';
import { buildAuditPdf, mcpCertificateCells } from '../audit-pdf';

const nodeRequire = createRequire(__filename);

const OWNER_ID = '33333333-3333-4333-8333-333333333333';
const ENVELOPE_ID = '11111111-1111-4111-8111-111111111111';
const SIGNER_ID = '22222222-2222-4222-8222-222222222222';
const KEY_ID = '77777777-7777-4777-8777-777777777777';

/** Metadata as WP-24 will write it. Fake, low-entropy fixture values only. */
function mcpMetadata(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    auth: 'api_key',
    key_id: KEY_ID,
    key_prefix: 'mcpfixture',
    key_name: 'Key 2',
    oauth_client_id: null,
    oauth_grant_id: null,
    acting_for_user_id: OWNER_ID,
    acting_for_email: 'ada@example.com',
    tool: 'envelopes_send',
    approval: 'email',
    approved_by_session: false,
    ...overrides,
  };
}

function sentEvent(metadata: Record<string, unknown>): EnvelopeEvent {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    envelope_id: ENVELOPE_ID,
    signer_id: null,
    actor_kind: 'sender',
    event_type: 'sent',
    ip: '203.0.113.10',
    user_agent: 'SealdMCP/1',
    metadata,
    created_at: '2026-03-11T20:59:04.000Z',
  };
}

function plainEvents(): EnvelopeEvent[] {
  return [
    {
      id: '44444444-4444-4444-8444-444444444444',
      envelope_id: ENVELOPE_ID,
      signer_id: null,
      actor_kind: 'sender',
      event_type: 'created',
      ip: '203.0.113.10',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T20:59:03.000Z',
    },
    sentEvent({}),
    {
      id: '66666666-6666-4666-8666-666666666666',
      envelope_id: ENVELOPE_ID,
      signer_id: SIGNER_ID,
      actor_kind: 'signer',
      event_type: 'signed',
      ip: '203.0.113.20',
      user_agent: 'Mozilla/5.0',
      metadata: {},
      created_at: '2026-03-11T21:21:22.000Z',
    },
  ];
}

describe('mcpCertificateCells (WP-23)', () => {
  it('returns no rows when the sent event has no metadata.mcp', () => {
    expect(mcpCertificateCells(plainEvents())).toEqual([]);
  });

  it('returns no rows when there is no sent event', () => {
    expect(mcpCertificateCells([])).toEqual([]);
  });

  it('returns no rows when metadata.mcp does not match the contract', () => {
    const events = [sentEvent({ mcp: { auth: 'basic', approval: 'email' } })];
    expect(mcpCertificateCells(events)).toEqual([]);
  });

  it('prints the email-link approval and the key name', () => {
    expect(mcpCertificateCells([sentEvent({ mcp: mcpMetadata() })])).toEqual([
      { label: 'Approval', value: 'Approved by owner (email link)' },
      { label: 'Sent via', value: 'Key 2' },
    ]);
  });

  it('prints the signed-in approval when a session was present', () => {
    const events = [sentEvent({ mcp: mcpMetadata({ approved_by_session: true }) })];
    expect(mcpCertificateCells(events)[0]).toEqual({
      label: 'Approval',
      value: 'Approved by owner (signed-in)',
    });
  });

  it('prints "API key" when the key has no name', () => {
    const events = [sentEvent({ mcp: mcpMetadata({ key_name: null }) })];
    expect(mcpCertificateCells(events)[1]).toEqual({ label: 'Sent via', value: 'API key' });
    const blank = [sentEvent({ mcp: mcpMetadata({ key_name: '   ' }) })];
    expect(mcpCertificateCells(blank)[1]).toEqual({ label: 'Sent via', value: 'API key' });
  });

  it('says a send without per-send approval when approval is not email', () => {
    for (const approval of ['unattended', 'none']) {
      const events = [sentEvent({ mcp: mcpMetadata({ approval }) })];
      expect(mcpCertificateCells(events)[0]).toEqual({
        label: 'Approval',
        value: 'Sent without per-send approval',
      });
    }
  });

  it('WP-45: names the owner who signed on the approval page, as a pair of cells', () => {
    const events = plainEvents().map((e) =>
      e.event_type === 'signed'
        ? { ...e, metadata: { via: 'mcp_approval', approval_id: 'appr-1' } }
        : e,
    );
    expect(mcpCertificateCells(events, [{ id: SIGNER_ID, name: 'Maya Owner' }])).toEqual([
      { label: 'Signed via', value: 'Owner approval page (signed-in)' },
      { label: 'Signed by owner', value: 'Maya Owner' },
    ]);
    // With an MCP send too: four cells, the send pair first.
    const both = events.map((e) =>
      e.event_type === 'sent' ? sentEvent({ mcp: mcpMetadata() }) : e,
    );
    expect(mcpCertificateCells(both, [])).toHaveLength(4);
    // A plain signature adds nothing.
    expect(mcpCertificateCells(plainEvents(), [{ id: SIGNER_ID, name: 'Maya' }])).toEqual([]);
  });

  it('always returns two cells so the two-column grid stays aligned', () => {
    const variants = [
      mcpMetadata(),
      mcpMetadata({ approved_by_session: true }),
      mcpMetadata({ approval: 'none', key_name: null }),
    ];
    for (const mcp of variants) {
      expect(mcpCertificateCells([sentEvent({ mcp })])).toHaveLength(2);
    }
  });
});

describe('audit PDF certificate with metadata.mcp (WP-23)', () => {
  let withoutMcp = '';
  let withMcp = '';
  let withNamelessKey = '';

  beforeAll(async () => {
    withoutMcp = normalizePdfText(extractPdfText(await buildAuditPdf(makeInput(plainEvents()))));
    const mcpEvents = plainEvents().map((e) =>
      e.event_type === 'sent' ? sentEvent({ mcp: mcpMetadata() }) : e,
    );
    withMcp = normalizePdfText(extractPdfText(await buildAuditPdf(makeInput(mcpEvents))));
    const namelessEvents = plainEvents().map((e) =>
      e.event_type === 'sent' ? sentEvent({ mcp: mcpMetadata({ key_name: null }) }) : e,
    );
    withNamelessKey = normalizePdfText(
      extractPdfText(await buildAuditPdf(makeInput(namelessEvents))),
    );
  }, 120_000);

  // The certificate's datagrid labels are letter-spaced and upper-cased in the
  // PDF text layer, and the body font's lowercase "k" extracts as "3", so these
  // checks compare whitespace-free upper-case text and avoid lowercase k.
  it('leaves the certificate free of MCP lines when metadata.mcp is absent', () => {
    const flat = flatUpper(withoutMcp);
    expect(flat).not.toContain('APPROVEDBYOWNER');
    expect(flat).not.toContain('SENTVIA');
    expect(flat).not.toContain('SENTWITHOUTPER');
    expect(flat).toContain('DELIVERYMODE');
    expect(flat).toContain('VALIDATORS');
  });

  it('prints the approval clause and the key name when metadata.mcp is present', () => {
    const flat = flatUpper(withMcp);
    expect(flat).toContain('APPROVEDBYOWNER(EMAIL');
    expect(flat).toContain('SENTVIAKEY2');
    expect(flat).not.toContain('SENTWITHOUTPER');
    // The rows sit between the existing ones; nothing is dropped.
    expect(flat).toContain('DELIVERYMODE');
    expect(flat).toContain('VALIDATORS');
  });

  it('prints "Sent via API key" when the key has no name', () => {
    const flat = flatUpper(withNamelessKey);
    expect(flat).toContain('SENTVIAAPI');
    expect(flat).not.toContain('KEY2');
  });

  it('WP-45: prints where the owner signed when the signed row says via=mcp_approval', async () => {
    const events = plainEvents().map((e) =>
      e.event_type === 'signed' ? { ...e, metadata: { via: 'mcp_approval' } } : e,
    );
    const flat = flatUpper(
      normalizePdfText(extractPdfText(await buildAuditPdf(makeInput(events)))),
    );
    // The body font's lowercase g extracts as 1 (see above).
    expect(flat).toContain('SIGNEDVIAOWNERAPPROVALPA1E(SI1NED-IN)');
    expect(flat).toContain('SIGNEDBYOWNER');
    expect(flatUpper(withoutMcp)).not.toContain('OWNERAPPROVALPAGE');
  }, 120_000);

  it('never prints a client name, even if one was smuggled into metadata', async () => {
    const events = plainEvents().map((e) =>
      e.event_type === 'sent'
        ? sentEvent({ mcp: { ...mcpMetadata(), client_name: 'EvilAgent/9' } })
        : e,
    );
    const text = normalizePdfText(extractPdfText(await buildAuditPdf(makeInput(events))));
    expect(text).not.toContain('EvilAgent');
  }, 120_000);
});

function makeInput(events: ReadonlyArray<EnvelopeEvent>): Parameters<typeof buildAuditPdf>[0] {
  const sealedSha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const envelope: Envelope = {
    id: ENVELOPE_ID,
    owner_id: OWNER_ID,
    title: 'Sample agreement',
    short_code: 'sampleCode014',
    status: 'completed',
    delivery_mode: 'parallel',
    original_pages: 2,
    original_sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    sealed_sha256: sealedSha256,
    sender_email: 'ada@example.com',
    sender_name: null,
    sent_at: '2026-03-11T20:59:04.000Z',
    completed_at: '2026-03-11T21:21:25.000Z',
    expires_at: '2026-04-11T20:59:03.000Z',
    tc_version: '2026-04-24',
    privacy_version: '2026-04-24',
    reminders_enabled: true,
    signers: [
      {
        id: SIGNER_ID,
        email: 'sam@example.com',
        name: 'Sam Signer',
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
    tags: [],
    created_at: '2026-03-11T20:59:03.000Z',
    updated_at: '2026-03-11T21:21:25.000Z',
  };
  const signerDetails: SignerAuditDetail[] = [
    {
      signer_id: SIGNER_ID,
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
    sealedPages: 2,
    cmsSealApplied: true,
    timestampApplied: true,
    publicUrl: 'https://seald.example',
  };
}

function extractPdfText(pdf: Buffer): string {
  const dir = mkdtempSync(join(tmpdir(), 'audit-pdf-mcp-'));
  const pdfPath = join(dir, 'audit.pdf');
  const scriptPath = join(dir, 'extract.mjs');
  const pdfjs = nodeRequire.resolve('pdfjs-dist/legacy/build/pdf.mjs');
  writeFileSync(pdfPath, pdf);
  writeFileSync(
    scriptPath,
    `import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const pdfjs = await import(pathToFileURL(${JSON.stringify(pdfjs)}).href);
const data = new Uint8Array(readFileSync(process.argv[2]));
const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
const parts = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  parts.push(content.items.map((item) => (item.str ? item.str : '')).join(' '));
}
process.stdout.write(parts.join('\\n'));
`,
  );
  const result = spawnSync(process.execPath, [scriptPath, pdfPath], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  rmSync(dir, { recursive: true, force: true });
  if (result.status !== 0) {
    throw new Error(result.stderr || `pdfjs exited ${result.status ?? 'null'}`);
  }
  return result.stdout;
}

function normalizePdfText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function flatUpper(text: string): string {
  return text.replace(/\s+/g, '').toUpperCase();
}
