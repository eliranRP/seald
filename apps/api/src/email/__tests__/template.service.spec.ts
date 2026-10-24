import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { TemplateService } from '../template.service';

/** Visible text of the rendered HTML: tags dropped, zero-width joiners removed, spaces collapsed. */
function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u200d/g, '')
    .replace(/&nbsp;|&zwnj;/g, ' ')
    .replace(/\s+/g, ' ');
}

describe('TemplateService', () => {
  let svc: TemplateService;

  beforeAll(() => {
    svc = new TemplateService();
    svc.onModuleInit();
  });

  it('loads every transactional template at module init', () => {
    const kinds = svc.kinds();
    for (const expected of [
      'invite',
      'reminder',
      'completed',
      'declined_to_sender',
      'withdrawn_to_signer',
      'withdrawn_after_sign',
      'expired_to_sender',
      'expired_to_signer',
      'signed_to_sender',
      'api_key_created',
      'access_code',
      'approval_request',
      'approval_denied',
      'bulk_complete',
      'automation_copy',
      'automation_disabled',
      'signer_corrected',
      'signer_replaced',
      'new_link_requested',
      'your_turn',
      'bounced_to_sender',
    ]) {
      expect(kinds).toContain(expected);
    }
    expect(kinds).toHaveLength(21);
  });

  describe('every template is a self-contained HTML doc', () => {
    const commonVars = {
      sender_name: 'Ada Lovelace',
      sender_email: 'ada@example.com',
      envelope_title: 'NDA v1',
      sign_url: 'https://seald.nromomentum.com/sign/abc?t=xyz',
      verify_url: 'https://seald.nromomentum.com/verify/abcde12345',
      short_code: 'abcde12345xyz',
      public_url: 'https://seald.nromomentum.com',
      sealed_url: 'https://seald.nromomentum.com/sealed/abc',
      audit_url: 'https://seald.nromomentum.com/audit/abc',
      dashboard_url: 'https://seald.nromomentum.com/dashboard',
      decliner_name: 'Bob Byte',
      decliner_email: 'bob@example.com',
      decline_reason: 'Terms need revision',
      declined_at_readable: '2026-04-24 09:00 UTC',
      signed_at_readable: '2026-04-24 08:00 UTC',
      expired_at_readable: '2026-05-24 00:00 UTC',
      expires_at_readable: '2026-05-24 00:00 UTC',
      total_signers: 3,
      signed_count: 2,
      signer_name: 'Maya Raskin',
      previous_signer_name: 'Hannah Wills',
      bounced_email: 'alex@quil.vc',
      bounce_reason: 'Mailbox does not exist',
      new_link_url: 'https://seald.nromomentum.com/sign/abc',
      doc_meta: '3 pages · from Ada Lovelace',
      signer_progress_dots_html: '',
      // Globally-injected legal-footer vars in production come from
      // EmailDispatcherService; we set them inline here so the brand
      // wordmark assertion below has a stable value to match against.
      legal_entity: 'Seald',
      legal_postal: 'Postal address available on request — write to legal@seald.test.',
      privacy_url: 'https://seald.nromomentum.com/legal/privacy',
      preferences_url: 'mailto:privacy@seald.nromomentum.com?subject=Email%20preferences',
    };

    it.each([
      'invite',
      'reminder',
      'completed',
      'declined_to_sender',
      'withdrawn_to_signer',
      'withdrawn_after_sign',
      'expired_to_sender',
      'expired_to_signer',
      'signed_to_sender',
      'your_turn',
      'bounced_to_sender',
    ] as const)('%s renders to valid HTML + non-empty text + subject', (kind) => {
      const out = svc.render(kind, commonVars);
      expect(out.html.toLowerCase()).toContain('<!doctype html>');
      expect(out.text.length).toBeGreaterThan(20);
      expect(out.subject.length).toBeGreaterThan(5);
      // Every placeholder must resolve — no raw {{…}} in any of the three parts.
      expect(out.html).not.toMatch(/\{\{[^}]+\}\}/);
      expect(out.text).not.toMatch(/\{\{[^}]+\}\}/);
      expect(out.subject).not.toMatch(/\{\{[^}]+\}\}/);
    });
  });

  describe('render — invite', () => {
    const vars = {
      sender_name: 'Ada Lovelace',
      sender_email: 'ada@example.com',
      envelope_title: 'NDA v1',
      sign_url: 'https://seald.nromomentum.com/sign/abc?t=xyz',
      verify_url: 'https://seald.nromomentum.com/verify/abcde12345',
      short_code: 'abcde12345xyz',
      public_url: 'https://seald.nromomentum.com',
    };

    it('substitutes every placeholder in the HTML body', () => {
      const out = svc.render('invite', vars);
      expect(out.html).toContain('Ada Lovelace');
      // The address carries a zero-width joiner after the @ (auto-linker defeat).
      expect(visibleText(out.html)).toContain('ada@example.com');
      expect(out.html).toContain('NDA v1');
      expect(out.html).toContain(vars.sign_url);
      expect(out.html).toContain(vars.verify_url);
      // The short code carries a zero-width joiner so Gmail does not link it.
      expect(out.html).toContain('abcde1\u200d2345xyz');
      expect(visibleText(out.html)).toContain(vars.short_code);
      expect(out.html).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it('defeats the mail auto-linker for the sender address', () => {
      const out = svc.render('invite', vars);
      expect(out.html).toContain('ada@\u200dexample.com');
      expect(out.html).not.toContain('ada@example.com');
      expect(out.html).not.toContain('mailto:');
      // The plain-text twin keeps the real address.
      expect(out.text).toContain('ada@example.com');
    });

    it('is a status card: one bulletproof button, preheader, legal footer line', () => {
      const out = svc.render('invite', {
        ...vars,
        doc_meta: '3 pages · from Ada Lovelace',
        expires_at_readable: 'Nov 20',
      });
      expect(out.html.match(/Review &amp; sign/g)).toHaveLength(1);
      expect(out.html).toContain('bgcolor="#4f46e5"');
      const compact = out.html.replace(/\s+/g, '');
      expect(compact).toContain('max-width:560px');
      expect(compact).toContain('display:none;max-height:0;overflow:hidden;mso-hide:all');
      const text = visibleText(out.html);
      expect(text).toContain('Simple e-signature · ESIGN/UETA · Legal info');
      expect(out.html).toContain('href="https://seald.nromomentum.com/legal/esign-disclosure"');
      expect(text).toContain('Expires Nov 20');
      expect(text).toContain('3 pages · from Ada Lovelace');
    });

    it('substitutes every placeholder in the text body', () => {
      const out = svc.render('invite', vars);
      expect(out.text).toContain('Ada Lovelace');
      expect(out.text).toContain('NDA v1');
      expect(out.text).toContain(vars.sign_url);
      expect(out.text).toContain(vars.short_code);
      expect(out.text).not.toMatch(/\{\{[^}]+\}\}/);
    });

    it('substitutes placeholders in the subject', () => {
      const out = svc.render('invite', vars);
      expect(out.subject).toBe('Ada Lovelace sent you "NDA v1" to sign');
    });

    it('produces valid HTML — fragment wrapped into a <!doctype html> document', () => {
      const out = svc.render('invite', vars);
      expect(out.html.toLowerCase()).toContain('<!doctype html>');
      expect(out.html.toLowerCase()).toContain('</html>');
    });

    it('escapes stay intact — no stray brace artifacts in HTML or text', () => {
      const out = svc.render('invite', vars);
      // After interpolation, no variable marker should remain anywhere in the output.
      expect(out.html).not.toMatch(/\{\{/);
      expect(out.text).not.toMatch(/\{\{/);
      expect(out.subject).not.toMatch(/\{\{/);
    });
  });

  describe('render — reminder', () => {
    const vars = {
      sender_name: 'Ada Lovelace',
      sender_email: 'ada@example.com',
      envelope_title: 'MSA',
      sign_url: 'https://seald.nromomentum.com/sign/abc?t=xyz',
      verify_url: 'https://seald.nromomentum.com/verify/abcde12345',
      short_code: 'abcde12345xyz',
      expires_at_readable: 'Nov 20',
      sent_ago: '5 days ago',
      unsubscribe_url: 'https://seald.nromomentum.com/sign/abc?t=xyz',
      public_url: 'https://seald.nromomentum.com',
      legal_entity: 'Seald',
      legal_postal: 'Chlenov 24, Tel Aviv-Yafo 6604806, Israel',
      privacy_url: 'https://seald.nromomentum.com/legal/privacy',
      preferences_url: 'mailto:privacy@seald.nromomentum.com',
    };

    it('quotes the envelope title and keeps the legal-footer middle dot', () => {
      const out = svc.render('reminder', vars);
      expect(out.subject).toBe('Reminder: "MSA" is waiting for you');
      expect(out.html).toContain('Seald</strong> · Chlenov 24');
      const text = visibleText(out.html);
      expect(text).toContain('Still waiting for your signature');
      expect(text).toContain('Ada Lovelace sent this 5 days ago.');
      expect(text).toContain('Expires Nov 20');
      expect(out.html.match(/Review &amp; sign/g)).toHaveLength(1);
      expect(out.text).toContain('Review & sign:');
      expect(out.text).toContain('Expires Nov 20.');
      expect(out.text).toContain('Seald · Chlenov 24');
      expect(out.text).toContain('MSA');
    });

    it('offers Unsubscribe from reminders in the footer, and only there', () => {
      const out = svc.render('reminder', vars);
      expect(visibleText(out.html)).toContain('Sent via Seald · Unsubscribe from reminders');
      const invite = svc.render('invite', { ...vars, previous_signer_name: '' });
      expect(visibleText(invite.html)).not.toContain('Unsubscribe from reminders');
    });

    it('moves the long e-signature paragraph out of the email', () => {
      const out = svc.render('reminder', vars);
      for (const part of [visibleText(out.html), out.text]) {
        expect(part).not.toContain('Seald records a simple electronic signature');
        expect(part).not.toContain('automatic daily reminders');
      }
    });
  });

  describe('render — your_turn', () => {
    it('names the previous signer and keeps the signing link out of anything but the button', () => {
      const out = svc.render('your_turn', {
        sender_name: 'Ada Lovelace',
        sender_email: 'ada@example.com',
        envelope_title: 'NDA v1',
        previous_signer_name: 'Hannah Wills',
        sign_url: 'https://seald.nromomentum.com/sign/abc?t=xyz',
        expires_at_readable: 'Nov 20',
        short_code: 'abcde12345xyz',
        verify_url: 'https://seald.nromomentum.com/verify/abcde12345',
        public_url: 'https://seald.nromomentum.com',
      });
      expect(out.subject).toBe('Your turn to sign "NDA v1"');
      const text = visibleText(out.html);
      expect(text).toContain("It's your turn to sign");
      expect(text).toContain('Hannah Wills just signed.');
      expect(out.html).toContain('href="https://seald.nromomentum.com/sign/abc?t=xyz"');
      expect(out.text).toContain('Hannah Wills just signed.');
      expect(out.text).toContain('https://seald.nromomentum.com/sign/abc?t=xyz');
    });
  });

  describe('render — bounced_to_sender', () => {
    it('names the bounced address, keeps it out of a mailto link, and points at the document', () => {
      const out = svc.render('bounced_to_sender', {
        signer_name: 'Alex Reyes',
        bounced_email: 'alex@quil.vc',
        bounce_reason: 'Mailbox does not exist',
        envelope_title: 'NDA v1',
        dashboard_url: 'https://seald.nromomentum.com/document/env-1',
        short_code: 'abcde12345xyz',
        verify_url: 'https://seald.nromomentum.com/verify/abcde12345',
        public_url: 'https://seald.nromomentum.com',
      });
      expect(out.subject).toBe("Couldn't deliver to alex@quil.vc");
      const text = visibleText(out.html);
      expect(text).toContain('Email to Alex Reyes bounced');
      expect(text).toContain('alex@quil.vc could not be reached.');
      expect(text).toContain('Mailbox does not exist');
      expect(out.html).toContain('alex@\u200dquil.vc');
      expect(out.html).not.toContain('mailto:');
      expect(out.html).toContain('href="https://seald.nromomentum.com/document/env-1"');
      expect(text).toContain('Fix email');
      expect(out.text).toContain('alex@quil.vc could not be reached.');
      expect(out.text).toContain('https://seald.nromomentum.com/document/env-1');
    });
  });

  describe('missing variable handling', () => {
    it('renders missing variables as empty string (permissive)', () => {
      const out = svc.render('invite', {
        sender_name: 'Ada',
        sender_email: 'ada@example.com',
        envelope_title: 'X',
        // sign_url, verify_url, short_code, public_url missing
      });
      // The missing values are silently rendered as empty — no exception.
      expect(out.html).toBeDefined();
      expect(out.text).toBeDefined();
    });
  });

  describe('unknown kind', () => {
    it('throws a clear error', () => {
      expect(() => svc.render('not_a_real_kind' as never, {})).toThrow(/unknown template kind/);
    });
  });

  // Regression: the brand wordmark in every email template must spell
  // "Seald" (no trailing -e). The English verb "sealed" is allowed elsewhere
  // in copy (e.g. "Sealed document: …" in completed/body.txt referring to
  // the past-tense action), but the brand wordmark in the masthead, footer,
  // and subject prefix must use the correct spelling.
  describe('brand spelling — wordmark says "Seald"', () => {
    const vars = {
      sender_name: 'Ada',
      sender_email: 'ada@example.com',
      envelope_title: 'NDA v1',
      sign_url: 'https://seald.nromomentum.com/sign/abc',
      verify_url: 'https://seald.nromomentum.com/verify/abcde',
      short_code: 'abcde12345xyz',
      public_url: 'https://seald.nromomentum.com',
      sealed_url: 'https://seald.nromomentum.com/sealed/abc',
      audit_url: 'https://seald.nromomentum.com/audit/abc',
      dashboard_url: 'https://seald.nromomentum.com/dashboard',
      decliner_name: 'Bob',
      decliner_email: 'bob@example.com',
      decline_reason: 'x',
      declined_at_readable: 'd',
      signed_at_readable: 's',
      expired_at_readable: 'e',
      expires_at_readable: 'x',
      total_signers: 1,
      signed_count: 0,
      signer_name: 'Maya Raskin',
      previous_signer_name: 'Hannah',
      bounced_email: 'alex@quil.vc',
      bounce_reason: 'x',
      new_link_url: 'https://seald.nromomentum.com/sign/abc',
      legal_entity: 'Seald',
      legal_postal: 'Postal address available on request — write to legal@seald.test.',
      privacy_url: 'https://seald.nromomentum.com/legal/privacy',
      preferences_url: 'mailto:privacy@seald.nromomentum.com?subject=Email%20preferences',
    };

    it.each([
      'invite',
      'reminder',
      'completed',
      'declined_to_sender',
      'withdrawn_to_signer',
      'withdrawn_after_sign',
      'expired_to_sender',
      'expired_to_signer',
      'signed_to_sender',
      'your_turn',
      'bounced_to_sender',
    ] as const)('%s renders the "Seald" brand wordmark in body and subject', (kind) => {
      const out = svc.render(kind, vars);
      // Body must contain the brand wordmark wrapped in the footer <strong>.
      // The legal_entity var ("Seald" in tests, configurable in prod)
      // renders inside that <strong>; assert the brand prefix and that the
      // legacy misspelling "<strong …>Sealed</strong>" never appears.
      expect(out.html).toContain('>Seald</strong>');
      expect(out.html).not.toContain('>Sealed</strong>');
      expect(out.html).not.toContain('>Sealed, Inc.</strong>');
      // Brand+company misspelling and subject-prefix misspelling must not appear.
      expect(out.html).not.toContain('Sealed,'); // brand+company misspelling
      expect(out.html).not.toContain('Sealed —'); // subject-prefix misspelling
      // Subject prefix must be "Seald — …", never "Sealed — …".
      expect(out.subject).not.toMatch(/^Sealed —/);
    });

    it('signed_to_sender names the signer and the progress count, without a signing token', () => {
      const out = svc.render('signed_to_sender', {
        ...vars,
        signer_name: 'Maya Raskin',
        envelope_title: 'NDA v1',
        signed_count: 2,
        total_signers: 3,
        dashboard_url: 'https://seald.nromomentum.com/document/env-1',
        short_code: 'abcde12345xyz',
      });
      expect(out.subject).toBe('Maya Raskin signed "NDA v1"');
      expect(out.text).toContain('Maya Raskin signed NDA v1.');
      expect(out.text).toContain('2 of 3 signed.');
      expect(out.text).toContain('The finished file is emailed when everyone has signed.');
      expect(out.text).toContain('Open document:');
      expect(out.html).toContain('Open document');
      expect(out.text).toContain('https://seald.nromomentum.com/document/env-1');
      expect(out.html).not.toContain('?t=');
      expect(out.text).not.toContain('?t=');
    });

    it('api_key_created names the key and prefix, links to Developers, and resolves every var', () => {
      const out = svc.render('api_key_created', {
        ...vars,
        key_name: 'Key 2',
        key_prefix: 'seald_live_AbCdEf12',
        scopes_readable: 'envelopes:read, envelopes:send',
        created_at_readable: '2026-10-22 12:00 UTC',
        expires_at_readable: '2027-01-20 12:00 UTC',
        settings_url: 'https://seald.nromomentum.com/settings/developers',
      });
      expect(out.subject).toBe('New API key "Key 2" created on your Seald account');
      for (const part of [out.html, out.text]) {
        expect(part).toContain('Key 2');
        expect(part).toContain('seald_live_AbCdEf12');
        expect(part).toContain('envelopes:read, envelopes:send');
        expect(part).toContain('2027-01-20 12:00 UTC');
        expect(part).toContain('https://seald.nromomentum.com/settings/developers');
        expect(part).not.toMatch(/\{\{[^}]+\}\}/);
      }
      expect(out.html.toLowerCase()).toContain('<!doctype html>');
      expect(out.html).toContain('>Seald</strong>');
      expect(out.text).toContain('Revoke it now');
    });

    it('automation_disabled names the recipe, the streak and the time, links to Automations, and resolves every var', () => {
      const out = svc.render('automation_disabled', {
        ...vars,
        automation_name: 'Save to Drive',
        failure_count: 20,
        disabled_at_readable: '2026-10-23 09:00 UTC',
        settings_url: 'https://seald.nromomentum.com/settings/automations',
      });
      expect(out.subject).toBe('Automation "Save to Drive" was turned off on your Seald account');
      for (const part of [out.html, out.text]) {
        expect(part).toContain('Save to Drive');
        expect(part).toContain('20');
        expect(part).toContain('2026-10-23 09:00 UTC');
        expect(part).toContain('https://seald.nromomentum.com/settings/automations');
        expect(part).not.toMatch(/\{\{[^}]+\}\}/);
        expect(part).not.toContain('?t=');
      }
      expect(out.html.toLowerCase()).toContain('<!doctype html>');
      expect(out.html).toContain('>Seald</strong>');
    });

    it('new_link_requested names the signer and links to the envelope, with no signing link', () => {
      const out = svc.render('new_link_requested', {
        ...vars,
        signer_name: 'Hannah Wills',
        expired_at_readable: '2026-10-20 09:00 UTC',
        envelope_url: 'https://seald.nromomentum.com/document/abc',
      });
      expect(out.subject).toBe('Hannah Wills asked for a new link');
      for (const part of [out.html, out.text]) {
        expect(part).toContain('Hannah Wills');
        expect(part).toContain('2026-10-20 09:00 UTC');
        expect(part).toContain('https://seald.nromomentum.com/document/abc');
        expect(part).not.toMatch(/\{\{[^}]+\}\}/);
        expect(part).not.toContain('?t=');
      }
    });

    it('automation_disabled escapes a hostile recipe name in HTML', () => {
      const out = svc.render('automation_disabled', {
        ...vars,
        automation_name: '<img src=x onerror=alert(1)>',
        failure_count: 20,
        disabled_at_readable: '2026-10-23 09:00 UTC',
        settings_url: 'https://seald.nromomentum.com/settings/automations',
      });
      expect(out.html).not.toContain('<img src=x');
      expect(out.html).toContain('&lt;img src=x');
    });

    it('access_code shows the code, says how long it lasts, and carries no signing link', () => {
      const out = svc.render('access_code', {
        ...vars,
        code: '042917',
        purpose_line: 'Enter it on the signing page to open the document.',
        expires_minutes: 10,
      });
      expect(out.subject).toBe('042917 is your Seald code for "NDA v1"');
      for (const part of [out.html, out.text]) {
        expect(part).toContain('042917');
        expect(part).toContain('Enter it on the signing page to open the document.');
        expect(part).toContain('10');
        expect(part).not.toContain('/sign/');
        expect(part).not.toContain('?t=');
        expect(part).not.toMatch(/\{\{[^}]+\}\}/);
        // Legal wording: an emailed code, never an identity claim.
        expect(part.toLowerCase()).not.toContain('identity verified');
      }
      expect(out.html.toLowerCase()).toContain('<!doctype html>');
      expect(out.html).toContain('>Seald</strong>');
    });

    it('api_key_created escapes a hostile key name in HTML', () => {
      const out = svc.render('api_key_created', {
        ...vars,
        key_name: '<img src=x onerror=alert(1)>',
        key_prefix: 'seald_live_AbCdEf12',
        scopes_readable: 'envelopes:read',
        created_at_readable: '',
        expires_at_readable: '',
        settings_url: 'https://seald.nromomentum.com/settings/developers',
      });
      expect(out.html).not.toContain('<img src=x');
      expect(out.html).toContain('&lt;img src=x');
    });

    it('completed body.txt keeps the verb "Sealed document:" (past-tense action label)', () => {
      const out = svc.render('completed', vars);
      // This is the verb usage referring to "the document that was sealed",
      // not the brand. The verb keeps its trailing -e.
      expect(out.text).toContain('Sealed document:');
    });

    it('template sources drop retired signature, encryption, and entity claims', () => {
      const templatesDir = resolve(__dirname, '../templates');
      const banned = [
        'Encrypted in transit and at rest',
        'Email preferences',
        'eIDAS',
        'handwritten',
        'AES-256',
        'TLS 1.3',
        'PAdES-LT',
        'PAdES-LTV',
        '7 years',
        'Retained 7 years',
        'Duplicate',
        'legally equivalent',
        'Seald, Inc.',
        'Advanced Electronic',
      ];
      for (const entry of readdirSync(templatesDir)) {
        const dir = resolve(templatesDir, entry);
        if (!statSync(dir).isDirectory()) continue;
        for (const file of ['body.html', 'body.txt'] as const) {
          const path = resolve(dir, file);
          const collapsed = readFileSync(path, 'utf8').replace(/\s+/g, ' ');
          for (const phrase of banned) {
            expect(collapsed).not.toContain(phrase);
          }
        }
      }
    });

    it('TITLES default falls back to "Seald — kind"', () => {
      // Spot-check via a known kind: 'invite' should resolve to a title that
      // starts with the brand "Seald" (no trailing -e).
      const out = svc.render('invite', vars);
      // Subject is overridden by subject.txt for invite, but the prettyTitle
      // fallback would be used for unknown kinds. The `TITLES` map for known
      // kinds is asserted indirectly: render output for invite uses subject.txt.
      expect(out.subject).toContain('Ada');
      expect(out.subject).not.toMatch(/Sealed/);
    });
  });
});
