import { writeFileSync } from 'node:fs';
import { buildSignerListHtml, buildTimelineHtml } from '../src/email/template-fragments';
import { TemplateService } from '../src/email/template.service';

const svc = new TemplateService();
svc.onModuleInit();

// Exercise the bare-email sender path — this is the case Gmail
// auto-links into a giant blue mailto. If the rendered output shows a
// normal bold text line, our reset is working.
const recipientEmail = 'eliranazulay@gmail.com';

const signerListHtml = buildSignerListHtml(
  [
    { name: 'Eliran', email: 'eliranazulay@gmail.com', status: 'pending' },
    { name: 'Maya Raskin', email: 'maya@northwind.co', status: 'signed', completedLabel: 'Apr 22' },
  ],
  { highlightEmail: recipientEmail },
);

const timelineHtml = buildTimelineHtml([
  { label: 'Envelope sent by Eliran', at: 'Apr 21, 2026 · 10:42 AM UTC' },
  { label: 'Maya Raskin signed', at: 'Apr 22, 2026 · 2:18 PM UTC' },
  { label: 'Envelope sealed and audit trail locked', at: 'Apr 24, 2026 · 9:07 AM UTC' },
]);

const vars = {
  sender_name: 'eliranazulay@gmail.com',
  sender_email: 'eliranazulay@gmail.com',
  envelope_title: 'SEED test envelope',
  sign_url: 'https://sealed.app/sign/96c64f23-0522-4d01-88fa-6f428a626cf2',
  verify_url: 'https://sealed.app/verify/code/FKXWAxpdWChG9',
  short_code: 'FKXWAxpdWChG9',
  public_url: 'https://sealed.app',
  sealed_url: 'https://sealed.app/sealed/abc',
  audit_url: 'https://sealed.app/audit/abc',
  dashboard_url: 'https://sealed.app/dashboard',
  decliner_name: 'Maya Raskin',
  decliner_email: 'maya@northwind.co',
  decline_reason: 'Terms on page 3 need renegotiation',
  declined_at_readable: 'Apr 24, 2026 · 09:00 UTC',
  signed_at_readable: 'Apr 22, 2026 · 14:18 UTC',
  expired_at_readable: 'Apr 24, 2026',
  expires_at_readable: 'in 4 days',
  total_signers: 3,
  signed_count: 1,
  signer_list_html: signerListHtml,
  timeline_html: timelineHtml,
};

const kinds = [
  'invite',
  'reminder',
  'completed',
  'declined_to_sender',
  'withdrawn_to_signer',
  'withdrawn_after_sign',
  'expired_to_sender',
  'expired_to_signer',
] as const;

for (const k of kinds) {
  const { html, subject } = svc.render(k, vars);
  writeFileSync(`/tmp/email-render/${k}.html`, html);
  console.log(`${k}  (${html.length} bytes)  subject: ${subject}`);
}
