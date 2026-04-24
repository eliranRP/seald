import { buildSignerListHtml, buildTimelineHtml } from './template-fragments';

describe('buildSignerListHtml', () => {
  it('returns empty string for an empty list', () => {
    expect(buildSignerListHtml([])).toBe('');
  });

  it('renders each signer with avatar, name, email, and status pill', () => {
    const html = buildSignerListHtml([
      { name: 'Ada Lovelace', email: 'ada@example.com', status: 'signed' },
      { name: 'Bob Byte', email: 'bob@example.com', status: 'pending' },
    ]);
    expect(html).toMatch(/<div class="signers">/);
    expect(html).toMatch(/AL/); // Ada Lovelace initials
    expect(html).toMatch(/BB/); // Bob Byte initials
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('ada@example.com');
    expect(html).toContain('avatar-success');
    expect(html).toContain('avatar-amber');
    expect(html).toContain('status-signed');
    expect(html).toContain('status-pending');
  });

  it('maps status to the correct CSS class and default label', () => {
    const pairs: ReadonlyArray<
      [Parameters<typeof buildSignerListHtml>[0][number]['status'], string, string]
    > = [
      ['signed', 'status-signed', 'Signed'],
      ['pending', 'status-pending', 'Pending'],
      ['waiting', 'status-waiting', 'Waiting'],
      ['declined', 'status-declined', 'Declined'],
      ['expired', 'status-expired', 'Did not sign'],
    ];
    for (const [status, cls, label] of pairs) {
      const html = buildSignerListHtml([{ name: 'X Y', email: 'x@y.com', status }]);
      expect(html).toContain(cls);
      expect(html).toContain(label);
    }
  });

  it('appends completedLabel to the signed status pill', () => {
    const html = buildSignerListHtml([
      {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        status: 'signed',
        completedLabel: 'Apr 22',
      },
    ]);
    expect(html).toContain('Signed · Apr 22');
  });

  it('highlights the self-row with "(that\'s you)" when highlightEmail matches', () => {
    const html = buildSignerListHtml(
      [
        { name: 'Ada Lovelace', email: 'ada@example.com', status: 'signed' },
        { name: 'Bob Byte', email: 'bob@example.com', status: 'pending' },
      ],
      { highlightEmail: 'BOB@example.com' },
    );
    expect(html).toContain('Bob Byte <span');
    expect(html).toContain("(that's you)");
    // Only Bob gets the suffix.
    expect(html).not.toMatch(/Ada Lovelace <span/);
  });

  it('HTML-escapes dynamic fields to avoid script injection via signer name/email', () => {
    const html = buildSignerListHtml([
      {
        name: '<script>alert(1)</script>',
        email: 'evil" onmouseover="x',
        status: 'signed',
      },
    ]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    // The unescaped double-quote is the attribute-injection vector. It
    // must not appear anywhere inside a signer field on the rendered
    // output (the `class="..."` quotes are template-owned, so check the
    // signer-email span content specifically).
    expect(html).toMatch(/<div class="signer-email"[^>]*>[^"]*evil&quot;/);
  });
});

describe('buildTimelineHtml', () => {
  it('returns empty string for an empty list', () => {
    expect(buildTimelineHtml([])).toBe('');
  });

  it('renders each event as an <li> with a <time> element', () => {
    const html = buildTimelineHtml([
      { label: 'Envelope sent by Ada', at: 'Apr 21, 2026 · 10:42 AM UTC' },
      { label: 'Bob signed', at: 'Apr 22, 2026 · 2:18 PM UTC' },
    ]);
    expect(html).toMatch(/^<ul class="timeline">/);
    expect(html).toMatch(/<\/ul>$/);
    expect(html).toContain('Envelope sent by Ada');
    expect(html).toContain('<time>Apr 21, 2026 · 10:42 AM UTC</time>');
  });

  it('omits <time> when at is empty', () => {
    const html = buildTimelineHtml([{ label: 'Envelope created', at: '' }]);
    expect(html).toContain('<li>Envelope created</li>');
    expect(html).not.toContain('<time>');
  });

  it('applies li.pending when pending=true', () => {
    const html = buildTimelineHtml([
      { label: 'Envelope sent', at: 'Apr 21' },
      { label: 'Envelope withdrawn', at: 'Apr 24', pending: true },
    ]);
    expect(html).toContain('<li class="pending">Envelope withdrawn');
    // First event must not get the pending class.
    expect(html.match(/<li class="pending">/g)?.length ?? 0).toBe(1);
  });

  it('HTML-escapes the label and timestamp', () => {
    const html = buildTimelineHtml([{ label: '<b>bad</b> event', at: '"&</time>' }]);
    expect(html).not.toContain('<b>bad</b>');
    expect(html).toContain('&lt;b&gt;bad&lt;/b&gt;');
    expect(html).toContain('&quot;&amp;&lt;/time&gt;');
  });
});
