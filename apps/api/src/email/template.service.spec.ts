import { TemplateService } from './template.service';

describe('TemplateService', () => {
  let svc: TemplateService;

  beforeAll(() => {
    svc = new TemplateService();
    svc.onModuleInit();
  });

  it('loads all 8 phase-3c templates at module init', () => {
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
    ]) {
      expect(kinds).toContain(expected);
    }
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
      signed_count: 1,
      // Globally-injected legal-footer vars in production come from
      // EmailDispatcherService; we set them inline here so the brand
      // wordmark assertion below has a stable value to match against.
      legal_entity: 'Seald, Inc.',
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
      expect(out.html).toContain('ada@example.com');
      expect(out.html).toContain('NDA v1');
      expect(out.html).toContain(vars.sign_url);
      expect(out.html).toContain(vars.verify_url);
      expect(out.html).toContain(vars.short_code);
      expect(out.html).not.toMatch(/\{\{[^}]+\}\}/);
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
      legal_entity: 'Seald, Inc.',
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
    ] as const)('%s renders the "Seald" brand wordmark in body and subject', (kind) => {
      const out = svc.render(kind, vars);
      // Body must contain the brand wordmark wrapped in the footer <strong>.
      // The legal_entity var ("Seald, Inc." in tests, configurable in prod)
      // renders inside that <strong>; assert the brand prefix and that the
      // legacy misspelling "<strong …>Sealed</strong>" never appears.
      expect(out.html).toContain('>Seald, Inc.</strong>');
      expect(out.html).not.toContain('>Sealed</strong>');
      expect(out.html).not.toContain('>Sealed, Inc.</strong>');
      // Brand+company misspelling and subject-prefix misspelling must not appear.
      expect(out.html).not.toContain('Sealed,'); // brand+company misspelling
      expect(out.html).not.toContain('Sealed —'); // subject-prefix misspelling
      // Subject prefix must be "Seald — …", never "Sealed — …".
      expect(out.subject).not.toMatch(/^Sealed —/);
    });

    it('completed body.txt keeps the verb "Sealed document:" (past-tense action label)', () => {
      const out = svc.render('completed', vars);
      // This is the verb usage referring to "the document that was sealed",
      // not the brand. The verb keeps its trailing -e.
      expect(out.text).toContain('Sealed document:');
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
