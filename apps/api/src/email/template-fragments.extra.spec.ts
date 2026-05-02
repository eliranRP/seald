import {
  buildSignerListHtmlFromSigners,
  buildTimelineHtml,
  type SignerSnapshot,
} from './template-fragments';

/**
 * Coverage for the SignerSnapshot → SignerFragment mapping helpers
 * (`buildSignerListHtmlFromSigners`, `mapSignerStatus`, `formatSignedDate`)
 * which the original spec exercised only through `buildSignerListHtml`.
 *
 * Behaviors covered:
 *   - completed → status "Signed" + completedLabel from signed_at
 *   - declined → status "Declined"
 *   - viewing → status "Waiting" (default branch)
 *   - awaiting → status "Pending"
 *   - asExpiredWhenUnsigned: true upgrades unsigned rows to "Did not sign"
 *     (used by the `expired_to_sender` template)
 *   - completed signers always keep "Signed", even with the
 *     asExpiredWhenUnsigned flag (only unsigned rows are reclassified)
 *   - highlightEmail flows through to the inner builder
 *   - formatSignedDate emits "Mon DD" for valid ISO; empty for invalid
 *   - protectEmailsInLabel wraps bare emails in non-clickable anchors
 *     so Gmail's auto-linker leaves them alone
 *
 * Empty list → empty string. (Already covered for the lower-level
 * helper; assert here too because the wrapper has its own short-circuit
 * via the inner call returning empty.)
 */

const COMPLETED: SignerSnapshot = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  status: 'completed',
  signed_at: '2026-04-22T14:18:07.000Z',
};
const VIEWING: SignerSnapshot = {
  name: 'Bea Bee',
  email: 'bea@example.com',
  status: 'viewing',
  signed_at: null,
};
const AWAITING: SignerSnapshot = {
  name: 'Carl Cee',
  email: 'carl@example.com',
  status: 'awaiting',
  signed_at: null,
};
const DECLINED: SignerSnapshot = {
  name: 'Dee Day',
  email: 'dee@example.com',
  status: 'declined',
  signed_at: null,
};

describe('buildSignerListHtmlFromSigners', () => {
  it('returns empty string for an empty list', () => {
    expect(buildSignerListHtmlFromSigners([])).toBe('');
  });

  it('renders completed → "Signed" pill + "Apr 22" completedLabel', () => {
    const html = buildSignerListHtmlFromSigners([COMPLETED]);
    expect(html).toContain('status-signed');
    // formatSignedDate is UTC-based and our fixture is 2026-04-22.
    expect(html).toContain('Signed · Apr 22');
  });

  it('renders viewing → "Waiting" (status-waiting)', () => {
    const html = buildSignerListHtmlFromSigners([VIEWING]);
    expect(html).toContain('status-waiting');
    expect(html).toContain('Waiting');
  });

  it('renders awaiting → "Pending" (status-pending)', () => {
    const html = buildSignerListHtmlFromSigners([AWAITING]);
    expect(html).toContain('status-pending');
    expect(html).toContain('Pending');
  });

  it('renders declined → "Declined" pill', () => {
    const html = buildSignerListHtmlFromSigners([DECLINED]);
    expect(html).toContain('status-declined');
    expect(html).toContain('Declined');
  });

  it('asExpiredWhenUnsigned upgrades unsigned rows to "Did not sign"', () => {
    // Used by the `expired_to_sender` template — call out the signers
    // who never signed inside the window.
    const html = buildSignerListHtmlFromSigners([AWAITING], {
      asExpiredWhenUnsigned: true,
    });
    expect(html).toContain('status-expired');
    expect(html).toContain('Did not sign');
  });

  it('asExpiredWhenUnsigned leaves completed rows alone (Signed wins)', () => {
    const html = buildSignerListHtmlFromSigners([COMPLETED], {
      asExpiredWhenUnsigned: true,
    });
    expect(html).toContain('status-signed');
    expect(html).toContain('Signed · Apr 22');
    expect(html).not.toContain('status-expired');
  });

  it('asExpiredWhenUnsigned leaves declined rows alone', () => {
    const html = buildSignerListHtmlFromSigners([DECLINED], {
      asExpiredWhenUnsigned: true,
    });
    expect(html).toContain('status-declined');
  });

  it('forwards highlightEmail to the inner builder ("(that\'s you)" suffix)', () => {
    const html = buildSignerListHtmlFromSigners([COMPLETED, VIEWING], {
      highlightEmail: 'bea@example.com',
    });
    expect(html).toContain("(that's you)");
    // Only the matching row gets the suffix.
    expect(html).toContain('Bea Bee');
  });

  it('formatSignedDate yields "" (no completedLabel) on an invalid signed_at', () => {
    const completedWithGarbage: SignerSnapshot = {
      ...COMPLETED,
      signed_at: 'not-a-date',
    };
    const html = buildSignerListHtmlFromSigners([completedWithGarbage]);
    expect(html).toContain('status-signed');
    // "Signed" pill renders WITHOUT the "· Apr 22" label since the date
    // parser short-circuits to empty string. The pill text is just
    // "Signed" — there's no trailing bullet.
    expect(html).not.toMatch(/Signed · /);
  });
});

describe('buildTimelineHtml — protectEmailsInLabel branch', () => {
  it('wraps bare email addresses in inline-styled anchors so Gmail does not auto-link them', () => {
    // Timeline label like "Envelope sent by ada@example.com" — the
    // protect-emails branch (lines 188-189 in template-fragments.ts)
    // wraps the email in a non-clickable anchor.
    const html = buildTimelineHtml([{ label: 'Envelope sent by ada@example.com', at: 'Apr 21' }]);
    expect(html).toContain('Envelope sent by');
    // The email got an anchor with mailto: + pointer-events:none so
    // Gmail's auto-linker stays out of it.
    expect(html).toContain('href="mailto:ada@example.com"');
    expect(html).toContain('pointer-events:none');
    expect(html).toContain('>ada@example.com</a>');
  });
});
