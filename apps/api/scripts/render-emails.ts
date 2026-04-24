import { writeFileSync } from 'node:fs';
import { TemplateService } from '../src/email/template.service';

const svc = new TemplateService();
svc.onModuleInit();

const vars = {
  sender_name: 'Eliran Azulay',
  sender_email: 'sender@seald.dev',
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
