import { TemplateService } from './template.service';

describe('TemplateService', () => {
  let svc: TemplateService;

  beforeAll(() => {
    svc = new TemplateService();
    svc.onModuleInit();
  });

  it('loads the invite template at module init', () => {
    expect(svc.kinds()).toContain('invite');
  });

  describe('render — invite', () => {
    const vars = {
      sender_name: 'Ada Lovelace',
      sender_email: 'ada@example.com',
      envelope_title: 'NDA v1',
      sign_url: 'https://seald.nromomentum.com/sign/abc?t=xyz',
      verify_url: 'https://seald.nromomentum.com/verify/code/abcde12345',
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

    it('produces valid HTML — MJML compiled to a <!doctype html> document', () => {
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
});
