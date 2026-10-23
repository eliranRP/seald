import type { ApprovalSummary } from 'shared';
import { TemplateService } from '../../email/template.service';
import { buildApprovalDeniedVars, buildApprovalRequestVars } from '../approval-email';

const PUBLIC = 'https://seald.nromomentum.com';
const ID = '00000000-0000-4000-8000-000000000001';
const TOKEN = 'T'.repeat(43);
const FOOTER = {
  legal_entity: 'Seald',
  legal_postal: 'Postal line',
  privacy_url: `${PUBLIC}/legal/privacy`,
  preferences_url: 'mailto:privacy@seald.test',
};

function summary(over: Partial<ApprovalSummary> = {}): ApprovalSummary {
  return {
    kind: 'envelope_send',
    action_label: 'Send for signature',
    title: 'Supplier NDA <script>',
    recipients: [
      { name: 'Known One', email: 'one@example.com', is_new: false },
      { name: 'Known Two', email: 'two@example.com', is_new: false },
    ],
    page_count: 3,
    key_name: 'Key 2',
    approver_email: 'owner@example.com',
    destination: null,
    ...over,
  };
}

describe('approval_request email', () => {
  const templates = new TemplateService();
  beforeAll(() => templates.onModuleInit());

  function render(s: ApprovalSummary, approveRequires: 'link' | 'session', fieldsUpdated = false) {
    const vars = buildApprovalRequestVars({
      summary: s,
      approveRequires,
      publicUrl: PUBLIC,
      approvalId: ID,
      token: TOKEN,
      fieldsUpdated,
    });
    return templates.render('approval_request', { ...FOOTER, ...vars });
  }

  it('every recipient known: one main Approve, a secondary Review fields, Deny as a small link', () => {
    const out = render(summary(), 'link');
    expect(out.html).toContain(`href="${PUBLIC}/approve#${TOKEN}"`);
    expect(out.html).toContain('>Approve</a>');
    expect(out.html).toContain(`href="${PUBLIC}/approve/${ID}/review"`);
    expect(out.html).toContain('>Review fields</a>');
    expect(out.html).toContain(`href="${PUBLIC}/approve?intent=deny#${TOKEN}"`);
    expect(out.html).toMatch(/font-size:13px;text-decoration:underline;">Deny<\/a>/);
    expect(out.html).not.toContain('Sign in to approve');
  });

  it('a new recipient: the one main button is "Sign in to approve" → review_url, no Review button', () => {
    const out = render(
      summary({
        recipients: [{ name: 'Fresh', email: 'fresh@example.com', is_new: true }],
      }),
      'session',
    );
    expect(out.html).toContain(`href="${PUBLIC}/approve/${ID}/review"`);
    expect(out.html).toContain('>Sign in to approve</a>');
    expect(out.html).not.toContain('>Review fields</a>');
    expect(out.html).not.toContain(`href="${PUBLIC}/approve#${TOKEN}"`);
    expect(out.html).toContain(`href="${PUBLIC}/approve?intent=deny#${TOKEN}"`);
    expect(out.html).toContain('>New</span>');
    expect(out.text).toContain('Sign in to approve:');
  });

  it('lists at most 3 recipients in HTML, New first, then "+N more"; the text part lists everyone', () => {
    const recipients = [
      { name: 'Old A', email: 'a@example.com', is_new: false },
      { name: 'Old B', email: 'b@example.com', is_new: false },
      { name: 'Old C', email: 'c@example.com', is_new: false },
      { name: 'New D', email: 'd@example.com', is_new: true },
      { name: 'Old E', email: 'e@example.com', is_new: false },
    ];
    const out = render(summary({ recipients }), 'session');
    expect(out.html).toContain('Recipients (5)');
    expect(out.html).toContain('+2 more');
    expect(out.html.indexOf('New D')).toBeLessThan(out.html.indexOf('Old A'));
    expect(out.html).not.toContain('Old C');
    for (const r of recipients) expect(out.text).toContain(`${r.name} <${r.email}>`);
    expect(out.text.indexOf('New D')).toBeLessThan(out.text.indexOf('Old A'));
  });

  it('names the key, says Expires in 24h and carries the one helper line; no signer link', () => {
    const out = render(summary(), 'link');
    expect(out.html).toContain('Key 2');
    expect(out.html).toContain('Expires in 24h');
    expect(out.html).toContain(
      "Only approve if you asked for this. Don't let an assistant or other software open this link.",
    );
    expect(out.html).toContain("Didn't ask for this? Deny and revoke the key.");
    expect(out.text).toContain('Expires in 24h');
    expect(out.html).not.toMatch(/\/sign\/[^"]*\?t=/);
    // The shared 560px shell and legal footer.
    expect(out.html).toContain('max-width: 560px');
    expect(out.html).toContain('<strong style="color: #1f2937">Seald</strong> · Postal line');
  });

  it('escapes document titles and names (they are data)', () => {
    const out = render(
      summary({
        recipients: [{ name: '<img src=x onerror=1>', email: 'x@example.com', is_new: true }],
      }),
      'session',
    );
    expect(out.html).not.toContain('<script>');
    expect(out.html).not.toContain('<img src=x');
    expect(out.html).toContain('Supplier NDA &lt;script&gt;');
    expect(out.html).toContain('&lt;img src=x onerror=1&gt;');
  });

  it('marks an email that follows an owner edit "Fields updated"', () => {
    expect(render(summary(), 'link', true).html).toContain('Fields updated');
    expect(render(summary(), 'link', false).html).not.toContain('Fields updated');
  });

  it('shows a recipe or Drive destination when there is one', () => {
    const out = render(
      summary({ recipients: [], destination: { kind: 'drive_folder', label: 'Q3 Contracts' } }),
      'session',
    );
    expect(out.html).toContain('Q3 Contracts');
    expect(out.text).toContain('Destination: Q3 Contracts');
  });
});

describe('approval_denied email', () => {
  const templates = new TemplateService();
  beforeAll(() => templates.onModuleInit());

  it('names the key ("You denied Key 3.") and links to revoke it, which needs sign-in', () => {
    const vars = buildApprovalDeniedVars({
      summary: summary({ key_name: 'Key 3' }),
      publicUrl: PUBLIC,
      suspended: false,
    });
    const out = templates.render('approval_denied', { ...FOOTER, ...vars });
    expect(out.subject).toBe('You denied Key 3');
    expect(out.html).toContain('Key 3');
    expect(out.html).toContain(`href="${PUBLIC}/settings/developers"`);
    expect(out.html).toContain('Revoke this key');
    expect(out.text).toContain('Nothing was sent.');
  });

  it('says the key can no longer send after the third denial in 24 hours', () => {
    const vars = buildApprovalDeniedVars({
      summary: summary(),
      publicUrl: PUBLIC,
      suspended: true,
    });
    expect(String(vars['suspended_line'])).toContain('denied 3 times in 24 hours');
  });
});
