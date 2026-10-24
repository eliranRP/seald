import { makeEnvelope, makeSigner } from '../../../test/factories';
import {
  buildEmailContextVars,
  formatSentAgo,
  formatShortDate,
  progressDots,
} from '../email-context';
import { buildProgressDotsHtml, buildProgressText, type ProgressDot } from '../template-fragments';

const envelope = makeEnvelope({
  id: 'env-1',
  status: 'awaiting_others',
  original_pages: 3,
  sender_name: 'Eliran',
  sent_at: '2026-10-18T08:00:00.000Z',
  expires_at: '2026-11-20T10:00:00.000Z',
  signers: [
    makeSigner({ id: 'a', signing_order: 1, signed_at: '2026-10-19T08:00:00.000Z' }),
    makeSigner({ id: 'b', signing_order: 2 }),
    makeSigner({ id: 'c', signing_order: 3, delivery_status: 'bounced' }),
    makeSigner({ id: 'd', signing_order: 4, declined_at: '2026-10-20T08:00:00.000Z' }),
  ],
});

describe('progressDots', () => {
  it('marks signed, recipient, bounced or declined, waiting, in signing order', () => {
    expect(progressDots(envelope.signers, 'b')).toEqual(['done', 'you', 'bad', 'bad']);
    expect(progressDots([...envelope.signers].reverse(), null)).toEqual([
      'done',
      'waiting',
      'bad',
      'bad',
    ]);
  });
});

describe('progress fragments', () => {
  const dots: ProgressDot[] = ['done', 'you', 'waiting', 'bad'];

  it('renders one 8px table cell per signer with the text twin as its name', () => {
    const html = buildProgressDotsHtml(dots);
    expect(html.match(/width="8" height="8"/g)).toHaveLength(4);
    expect(html).toContain('aria-label="1 of 4 signed"');
    expect(html).toContain('bgcolor="#10B981"');
    expect(html).toContain('bgcolor="#4F46E5"');
    expect(html).toContain('bgcolor="#CBD5E1"');
    expect(html).toContain('bgcolor="#EF4444"');
    expect(html).not.toMatch(/<img|display:\s*flex/);
    expect(buildProgressText(dots)).toBe('1 of 4 signed');
  });

  it('renders nothing for an envelope with no signers', () => {
    expect(buildProgressDotsHtml([])).toBe('');
    expect(buildProgressText([])).toBe('');
  });
});

describe('buildEmailContextVars', () => {
  const now = new Date('2026-10-23T12:00:00.000Z');
  const input = {
    kind: 'invite' as const,
    signerId: 'b',
    envelope,
    payload: {},
    publicUrl: 'https://seald.example',
    now,
  };

  it('fills the card variables from the envelope', () => {
    const vars = buildEmailContextVars(input);
    expect(vars['doc_meta']).toBe('3 pages · from Eliran');
    expect(vars['expires_at_readable']).toBe('Nov 20');
    expect(vars['sent_ago']).toBe('5 days ago');
    expect(vars['signer_progress_text']).toBe('1 of 4 signed');
    expect(vars['signer_progress_dots_html']).toContain('aria-label="1 of 4 signed"');
    expect(vars['new_link_url']).toBe('https://seald.example/sign/env-1');
  });

  it('describes the signer count, not a sender, on sender-facing mail', () => {
    const vars = buildEmailContextVars({ ...input, kind: 'signed_to_sender', signerId: null });
    expect(vars['doc_meta']).toBe('3 pages · 4 signers');
  });

  it('never overrides a value the payload carries', () => {
    const vars = buildEmailContextVars({
      ...input,
      payload: {
        expires_at_readable: '2026-11-20 10:00 UTC',
        sender_name: 'Payload Name',
        decline_reason: 'Too long',
      },
    });
    expect(vars).not.toHaveProperty('expires_at_readable');
    expect(vars).not.toHaveProperty('decline_reason');
    expect(vars['doc_meta']).toBe('3 pages · from Payload Name');
  });

  it('defaults an empty decline reason', () => {
    expect(
      buildEmailContextVars({ ...input, payload: { decline_reason: '' } })['decline_reason'],
    ).toBe('No reason given.');
  });
});

describe('date helpers', () => {
  it('formats a short UTC date and tolerates garbage', () => {
    expect(formatShortDate('2026-11-20T23:30:00.000Z')).toBe('Nov 20');
    expect(formatShortDate('nope')).toBe('');
  });

  it('says today, yesterday, then days', () => {
    const now = new Date('2026-10-23T12:00:00.000Z');
    expect(formatSentAgo('2026-10-23T01:00:00.000Z', now)).toBe('today');
    expect(formatSentAgo('2026-10-22T23:00:00.000Z', now)).toBe('yesterday');
    expect(formatSentAgo('2026-10-18T08:00:00.000Z', now)).toBe('5 days ago');
    expect(formatSentAgo('nope', now)).toBe('earlier');
  });
});
