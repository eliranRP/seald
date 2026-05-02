// Regression: F-001 (HIGH) — email template HTML injection.
//
// `TemplateService.interpolate()` historically substituted `{{var}}`
// placeholders verbatim. Variables like `envelope_title` and `sender_name`
// originate from authenticated user DTOs and reach `<strong>{{envelope_title}}</strong>`
// inside transactional HTML bodies. An attacker could inject `<a href=...>`
// or other markup that some mail clients render. The fix: escape every
// substituted value in the HTML body, with a carve-out for keys whose name
// ends with `_html` (those are produced by `template-fragments.ts` whose
// builders already escape their inputs and intentionally emit live markup).
//
// Plain-text and subject channels stay raw — there is no HTML rendering
// context to defend.
//
// See memory/security_report_2026-05-02.md F-001.
import { TemplateService } from './template.service';

describe('TemplateService — HTML escaping (F-001)', () => {
  let svc: TemplateService;

  // Minimal vars set covering everything the `invite` template references.
  const baseInviteVars: Record<string, string | number> = {
    sender_name: 'Ada Lovelace',
    sender_email: 'ada@example.com',
    envelope_title: 'NDA v1',
    sign_url: 'https://seald.nromomentum.com/sign/abc?t=xyz',
    verify_url: 'https://seald.nromomentum.com/verify/abcde12345',
    short_code: 'abcde12345xyz',
    public_url: 'https://seald.nromomentum.com',
    legal_entity: 'Seald, Inc.',
    legal_postal: 'Postal address available on request — write to legal@seald.test.',
    privacy_url: 'https://seald.nromomentum.com/legal/privacy',
    preferences_url: 'mailto:privacy@seald.nromomentum.com?subject=Email%20preferences',
  };

  beforeAll(() => {
    svc = new TemplateService();
    svc.onModuleInit();
  });

  it('escapes HTML metacharacters in user-controlled vars when rendering body.html', () => {
    const malicious = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const out = svc.render('invite', {
      ...baseInviteVars,
      envelope_title: malicious,
      sender_name: '"><svg/onload=alert(3)>',
    });

    // The escaped form must appear in the HTML body.
    expect(out.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(out.html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(out.html).toContain('&quot;&gt;&lt;svg/onload=alert(3)&gt;');

    // The raw injection must NOT appear anywhere in the HTML body.
    expect(out.html).not.toContain('<img src=x onerror');
    expect(out.html).not.toContain('<script>alert(2)');
    expect(out.html).not.toContain('<svg/onload=alert(3)');
  });

  it('does NOT escape `*_html` keys — fragment builders pre-escape and emit trusted markup', () => {
    const trustedFragment =
      '<table role="presentation" class="signers"><tr><td>Ada</td></tr></table>';
    const out = svc.render('reminder', {
      ...baseInviteVars,
      expires_at_readable: '2026-05-24 00:00 UTC',
      // `signer_list_html` is the fragment-builder output. It must reach
      // the rendered body as live HTML, otherwise the email shows angle
      // brackets to the user.
      signer_list_html: trustedFragment,
    });
    expect(out.html).toContain(trustedFragment);
    // And it must NOT have been escaped to entities.
    expect(out.html).not.toContain('&lt;table');
  });

  it('does NOT escape body.txt or subject — those have no HTML rendering context', () => {
    const out = svc.render('invite', {
      ...baseInviteVars,
      envelope_title: '<b>Q1 Roadmap & Pricing</b>',
      sender_name: 'Ada & Co.',
    });
    // Subject is plain-text in the mail header — escaping would mangle it.
    expect(out.subject).toContain('<b>Q1 Roadmap & Pricing</b>');
    expect(out.subject).toContain('Ada & Co.');
    // body.txt is plain-text — same reasoning.
    expect(out.text).toContain('<b>Q1 Roadmap & Pricing</b>');
    expect(out.text).toContain('Ada & Co.');
  });

  it('preserves URL safety — `*_url` keys still get escaped so `"` cannot break out of an href attribute', () => {
    // If a URL ever sneaks through validation containing a quote, the
    // escape must still neutralize attribute-context breakouts.
    const out = svc.render('invite', {
      ...baseInviteVars,
      sign_url: 'https://seald.nromomentum.com/sign/abc"><script>alert(1)</script>',
    });
    expect(out.html).not.toContain('"><script>alert(1)</script>');
    expect(out.html).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('still substitutes safe content unchanged after escaping', () => {
    const out = svc.render('invite', baseInviteVars);
    expect(out.html).toContain('Ada Lovelace');
    expect(out.html).toContain('NDA v1');
    expect(out.html).toContain(baseInviteVars.sign_url as string);
    // No leftover placeholders.
    expect(out.html).not.toMatch(/\{\{[^}]+\}\}/);
  });
});
