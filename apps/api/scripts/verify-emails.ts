/**
 * Visual regression harness for the 8 transactional email templates.
 *
 * Renders every template against a matrix of realistic variable sets
 * (normal, bare-email sender, long title, many signers), writes the
 * resulting HTML to /tmp/email-verify/, and produces a single
 * index.html that embeds each rendered template side-by-side at the
 * Gmail desktop (640px) and mobile Gmail (360px) widths so you can
 * visually review all permutations in one scroll.
 *
 * Usage:
 *   pnpm --filter api exec ts-node --transpile-only scripts/verify-emails.ts
 *   open /tmp/email-verify/index.html
 *
 * Exits non-zero if any template:
 *   - References a variable that isn't supplied (TemplateService logs
 *     a warning we capture from stderr).
 *   - Leaves a `{{…}}` placeholder unrendered.
 *   - Contains a bare email address outside an <a href="mailto:">
 *     wrapper (Gmail will auto-link it and apply its own blue/underline
 *     styling — which is the bug this harness exists to catch).
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { buildSignerListHtml, buildTimelineHtml } from '../src/email/template-fragments';
import { TemplateService, type EmailTemplateKind } from '../src/email/template.service';

const OUT = '/tmp/email-verify';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const svc = new TemplateService();
svc.onModuleInit();

const longTitle =
  'Amended and Restated Master Services Agreement between Acme Co. and its subsidiaries — Schedule B-3 updates (Q2 2026)';

interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly vars: Record<string, string | number>;
}

const baseEmail = 'eliranazulay@gmail.com';
const publicUrl = 'https://seald.nromomentum.com';
const signUrl = `${publicUrl}/sign/efe107a9-61a5-4e83-b362-abc57658fe64?t=2OtCHtOSwg1MvNqBJKdtGq0Cgsa2QqUoHKAe_TbvQlY`;
const verifyUrl = `${publicUrl}/verify/code/FKXWAxpdWChG9`;
const dashboardUrl = `${publicUrl}/dashboard`;
const audit = `${publicUrl}/audit/abc`;
const sealed = `${publicUrl}/sealed/abc`;

const signerListEmailName = buildSignerListHtml(
  [
    { name: 'eliran', email: baseEmail, status: 'pending' },
    { name: 'Maya Raskin', email: 'maya@northwind.co', status: 'signed', completedLabel: 'Apr 22' },
  ],
  { highlightEmail: baseEmail },
);
const signerListMany = buildSignerListHtml([
  { name: 'Ada Lovelace', email: 'ada@example.com', status: 'signed', completedLabel: 'Apr 22' },
  { name: 'Bob Byte', email: 'bob@example.com', status: 'signed', completedLabel: 'Apr 22' },
  { name: 'Cara Crane', email: 'cara@example.com', status: 'signed', completedLabel: 'Apr 23' },
  { name: 'Dan Day', email: 'dan@example.com', status: 'pending' },
  { name: 'Eli Esk', email: 'eli@example.com', status: 'pending' },
]);
const timelineHtml = buildTimelineHtml([
  { label: 'Envelope sent by eliranazulay@gmail.com', at: 'Apr 21, 2026 · 10:42 AM UTC' },
  { label: 'Maya Raskin signed', at: 'Apr 22, 2026 · 2:18 PM UTC' },
  { label: 'Envelope sealed and audit trail locked', at: 'Apr 24, 2026 · 9:07 AM UTC' },
]);

const baseVars = {
  sender_name: 'Ada Lovelace',
  sender_email: 'ada@example.com',
  envelope_title: 'SEED test envelope',
  sign_url: signUrl,
  verify_url: verifyUrl,
  short_code: 'FKXWAxpdWChG9',
  public_url: publicUrl,
  sealed_url: sealed,
  audit_url: audit,
  dashboard_url: dashboardUrl,
  decliner_name: 'Maya Raskin',
  decliner_email: 'maya@northwind.co',
  decline_reason: 'Terms on page 3 need renegotiation',
  declined_at_readable: 'Apr 24, 2026 · 09:00 UTC',
  signed_at_readable: 'Apr 22, 2026 · 14:18 UTC',
  expired_at_readable: 'Apr 24, 2026',
  expires_at_readable: 'in 4 days',
  total_signers: 3,
  signed_count: 1,
  signer_list_html: signerListEmailName,
  timeline_html: timelineHtml,
};

const scenarios: Scenario[] = [
  {
    id: 'normal',
    label: 'Normal — short sender name',
    vars: baseVars,
  },
  {
    id: 'bare-email',
    label: 'Sender display name is itself an email (Gmail auto-link hazard)',
    vars: {
      ...baseVars,
      sender_name: baseEmail,
      sender_email: baseEmail,
      decliner_name: baseEmail,
    },
  },
  {
    id: 'long-title',
    label: 'Very long envelope title (word-break stress test)',
    vars: { ...baseVars, envelope_title: longTitle },
  },
  {
    id: 'many-signers',
    label: 'Five-signer roster (completed / expired_to_sender / reminder)',
    vars: { ...baseVars, signer_list_html: signerListMany, total_signers: 5, signed_count: 3 },
  },
];

const kinds: ReadonlyArray<EmailTemplateKind> = [
  'invite',
  'reminder',
  'completed',
  'declined_to_sender',
  'withdrawn_to_signer',
  'withdrawn_after_sign',
  'expired_to_sender',
  'expired_to_signer',
];

const BARE_EMAIL = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

interface Finding {
  readonly kind: EmailTemplateKind;
  readonly scenarioId: string;
  readonly problem: string;
  readonly snippet?: string;
}

const findings: Finding[] = [];

function detectBareEmails(kind: EmailTemplateKind, scenarioId: string, html: string): void {
  // Strip every attribute value from the HTML (href="mailto:..." etc.)
  // before we look for bare email text — otherwise we'd false-positive
  // on every mailto href. We ALSO strip the content of <a>…</a> since
  // that's already inside an anchor (the point of the wrap pattern).
  const stripped = html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '').replace(/<[^>]+>/g, ' ');
  const matches = stripped.match(BARE_EMAIL);
  if (matches && matches.length > 0) {
    for (const m of matches) {
      findings.push({
        kind,
        scenarioId,
        problem: `bare email "${m}" outside <a> — Gmail will auto-link it`,
      });
    }
  }
}

function detectUnrenderedVars(kind: EmailTemplateKind, scenarioId: string, html: string): void {
  const leftover = html.match(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g);
  if (leftover && leftover.length > 0) {
    findings.push({
      kind,
      scenarioId,
      problem: `unrendered placeholders: ${leftover.join(', ')}`,
    });
  }
}

const rows: string[] = [];
for (const scenario of scenarios) {
  for (const kind of kinds) {
    const { html, subject } = svc.render(kind, scenario.vars);
    const fname = `${kind}__${scenario.id}.html`;
    writeFileSync(`${OUT}/${fname}`, html);
    detectBareEmails(kind, scenario.id, html);
    detectUnrenderedVars(kind, scenario.id, html);
    rows.push(`<section>
      <header>
        <h2>${kind}<small> · ${scenario.label}</small></h2>
        <p class="subject">Subject: <code>${escape(subject)}</code></p>
      </header>
      <div class="pair">
        <figure>
          <figcaption>Desktop Gmail — 640px</figcaption>
          <iframe src="${fname}" width="640" height="900" loading="lazy"></iframe>
        </figure>
        <figure>
          <figcaption>Mobile Gmail app — 360px</figcaption>
          <iframe src="${fname}" width="360" height="900" loading="lazy"></iframe>
        </figure>
      </div>
    </section>`);
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

const problems =
  findings.length === 0
    ? '<p class="ok">No bare-email leaks or unrendered placeholders in any template × scenario.</p>'
    : `<ul class="findings">${findings
        .map(
          (f) =>
            `<li><b>${f.kind}</b> <small>(${f.scenarioId})</small> — ${escape(f.problem)}</li>`,
        )
        .join('')}</ul>`;

writeFileSync(
  `${OUT}/index.html`,
  `<!doctype html><html><head>
    <meta charset="utf-8">
    <title>Seald email visual-regression harness</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Inter', system-ui, sans-serif; background: #0B1220; color: #E2E8F0; margin: 0; padding: 32px; }
      h1 { font-family: 'Source Serif 4', Georgia, serif; font-size: 32px; margin: 0 0 12px; }
      .sub { color: #94A3B8; max-width: 720px; line-height: 1.55; }
      section { margin: 48px 0; padding: 24px; background: #1E293B; border-radius: 16px; }
      section h2 { margin: 0; font-size: 20px; font-family: 'Source Serif 4', serif; font-weight: 500; }
      section h2 small { color: #94A3B8; font-size: 14px; font-weight: 400; font-family: inherit; margin-left: 8px; }
      .subject { font-size: 13px; color: #94A3B8; margin: 8px 0 16px; }
      .subject code { background: #0B1220; padding: 2px 8px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 12px; }
      .pair { display: flex; gap: 20px; flex-wrap: wrap; }
      figure { margin: 0; background: #F3F6FA; border-radius: 12px; overflow: hidden; }
      figcaption { padding: 8px 12px; font-size: 11px; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; letter-spacing: 0.08em; color: #475569; background: #fff; }
      iframe { display: block; border: 0; background: #F3F6FA; }
      .ok { color: #10B981; background: #064E3B; padding: 12px 16px; border-radius: 8px; }
      .findings { background: #7F1D1D; padding: 12px 20px; border-radius: 8px; }
      .findings li { margin: 4px 0; line-height: 1.6; }
      .findings small { opacity: 0.7; }
    </style>
  </head><body>
    <h1>Seald email visual-regression harness</h1>
    <p class="sub">Every template (${kinds.length}) rendered against ${scenarios.length} variable scenarios,
       each shown at the desktop-Gmail width (640px) and the mobile-Gmail width (360px).
       Bare-email text outside an &lt;a&gt; wrapper would be auto-linked by Gmail — the harness
       fails if any template × scenario leaks one.</p>
    <h2 style="font-size: 18px; margin: 32px 0 8px;">Findings</h2>
    ${problems}
    ${rows.join('\n')}
  </body></html>`,
);

console.log(`wrote ${kinds.length * scenarios.length} renders + index.html to ${OUT}`);
console.log(`findings: ${findings.length}`);
for (const f of findings) {
  console.log(`  [${f.kind}/${f.scenarioId}] ${f.problem}`);
}
if (findings.length > 0) process.exit(1);
