import { describe, expect, it } from 'vitest';
import {
  formatDateOnly,
  formatWhen,
  SIGNER_STATUS_LABEL,
  SIGNER_STATUS_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  TERMINAL_STATUSES,
} from './lib';

describe('STATUS_LABEL / STATUS_TONE', () => {
  it('exposes a label + tone for every envelope status the API returns', () => {
    // Lock the public contract — these maps are surfaced verbatim in the
    // header badge and any new server status would crash the render
    // until added here.
    const expected = [
      'draft',
      'awaiting_others',
      'sealing',
      'completed',
      'declined',
      'expired',
      'canceled',
    ] as const;
    for (const s of expected) {
      expect(STATUS_LABEL[s]).toBeTruthy();
      expect(STATUS_TONE[s]).toBeTruthy();
    }
  });

  it('uses Sealed (not Completed) for the terminal happy path so senders recognise the PAdES seal', () => {
    expect(STATUS_LABEL.completed).toBe('Sealed');
    expect(STATUS_TONE.completed).toBe('emerald');
  });

  it('flags expired/declined as red so the danger state is unambiguous in the badge', () => {
    expect(STATUS_TONE.expired).toBe('red');
    expect(STATUS_TONE.declined).toBe('red');
  });
});

describe('SIGNER_STATUS_LABEL / SIGNER_STATUS_TONE', () => {
  it('maps the four signer UI statuses to friendly labels and tones', () => {
    expect(SIGNER_STATUS_LABEL.awaiting).toBe('Waiting');
    expect(SIGNER_STATUS_LABEL.viewing).toBe('Viewing');
    expect(SIGNER_STATUS_LABEL.completed).toBe('Signed');
    expect(SIGNER_STATUS_LABEL.declined).toBe('Declined');
    expect(SIGNER_STATUS_TONE.completed).toBe('emerald');
    expect(SIGNER_STATUS_TONE.declined).toBe('red');
  });
});

describe('TERMINAL_STATUSES', () => {
  it('includes only the four end-of-life statuses (the page hides Withdraw on these)', () => {
    expect(TERMINAL_STATUSES.has('completed')).toBe(true);
    expect(TERMINAL_STATUSES.has('declined')).toBe(true);
    expect(TERMINAL_STATUSES.has('expired')).toBe(true);
    expect(TERMINAL_STATUSES.has('canceled')).toBe(true);
  });

  it('does NOT include in-progress statuses — Withdraw must remain available there', () => {
    expect(TERMINAL_STATUSES.has('draft')).toBe(false);
    expect(TERMINAL_STATUSES.has('awaiting_others')).toBe(false);
    expect(TERMINAL_STATUSES.has('sealing')).toBe(false);
  });
});

describe('formatWhen', () => {
  it('returns an em-dash when the timestamp is null', () => {
    expect(formatWhen(null)).toBe('—');
  });

  it('returns an em-dash when the timestamp is unparseable', () => {
    expect(formatWhen('not-a-date')).toBe('—');
  });

  it('formats a real ISO timestamp through toLocaleString (month/day/hour/minute)', () => {
    const out = formatWhen('2026-04-01T12:34:56Z');
    // We don't pin the locale (jsdom inherits the host), so just assert the
    // formatter produced *some* non-empty, non-em-dash string and didn't
    // include the year (rule: month + day + hour + minute only).
    expect(out).not.toBe('—');
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain('2026');
  });
});

describe('formatDateOnly', () => {
  it('returns an em-dash for null and invalid input', () => {
    expect(formatDateOnly(null)).toBe('—');
    expect(formatDateOnly('garbage')).toBe('—');
  });

  it('renders only month + day (no time portion) for the header sent-at', () => {
    const out = formatDateOnly('2026-04-01T12:34:56Z');
    expect(out).not.toBe('—');
    // Hour/minute glyphs (colon) must not appear.
    expect(out).not.toMatch(/\d{1,2}:\d{2}/);
  });
});
