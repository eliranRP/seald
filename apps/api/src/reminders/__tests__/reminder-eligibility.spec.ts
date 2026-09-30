import {
  REMINDER_INTERVAL_MS,
  isAutomatedReminderDue,
  type ReminderClock,
} from '../reminder-eligibility';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');
const DAY = REMINDER_INTERVAL_MS;

function clock(overrides: Partial<ReminderClock> = {}): ReminderClock {
  return {
    status: 'awaiting_others',
    remindersEnabled: true,
    expiresAtMs: NOW + 7 * DAY,
    signedAt: null,
    declinedAt: null,
    invitedAtMs: NOW - DAY,
    lastRemindedAtMs: null,
    lastMailAtMs: NOW - DAY,
    ...overrides,
  };
}

describe('isAutomatedReminderDue', () => {
  it('pins the interval at 24 hours, so 23 hours is not due', () => {
    expect(REMINDER_INTERVAL_MS).toBe(86_400_000);
    const invited = Date.parse('2026-05-01T12:00:00.000Z');
    const base = clock({
      invitedAtMs: invited,
      lastMailAtMs: invited,
      lastRemindedAtMs: null,
    });
    expect(isAutomatedReminderDue(base, invited + 23 * 60 * 60 * 1000)).toBe(false);
    expect(isAutomatedReminderDue(base, invited + 86_400_000)).toBe(true);
  });

  it('is due 24h after the invite when nothing newer exists', () => {
    expect(isAutomatedReminderDue(clock(), NOW)).toBe(true);
  });

  it('waits when the invite or the last reminder mail is inside the window', () => {
    expect(isAutomatedReminderDue(clock({ invitedAtMs: NOW - DAY + 1 }), NOW)).toBe(false);
    expect(isAutomatedReminderDue(clock({ lastMailAtMs: NOW - 60_000 }), NOW)).toBe(false);
    expect(isAutomatedReminderDue(clock({ lastRemindedAtMs: NOW - 60_000 }), NOW)).toBe(false);
  });

  it('uses the latest of invite, last reminder stamp, and last mail', () => {
    expect(
      isAutomatedReminderDue(
        clock({
          invitedAtMs: NOW - 3 * DAY,
          lastRemindedAtMs: NOW - 2 * DAY,
          lastMailAtMs: NOW - DAY,
        }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isAutomatedReminderDue(
        clock({
          invitedAtMs: NOW - 3 * DAY,
          lastRemindedAtMs: NOW - DAY,
          lastMailAtMs: NOW - 30 * 60 * 1000,
        }),
        NOW,
      ),
    ).toBe(false);
  });

  it('skips when reminders are disabled', () => {
    expect(isAutomatedReminderDue(clock({ remindersEnabled: false }), NOW)).toBe(false);
  });

  it('skips signers who already signed or declined', () => {
    expect(isAutomatedReminderDue(clock({ signedAt: '2026-04-30T00:00:00.000Z' }), NOW)).toBe(
      false,
    );
    expect(isAutomatedReminderDue(clock({ declinedAt: '2026-04-30T00:00:00.000Z' }), NOW)).toBe(
      false,
    );
  });

  it('skips envelopes that are no longer awaiting signatures', () => {
    for (const status of ['completed', 'declined', 'expired', 'canceled', 'sealing', 'draft']) {
      expect(isAutomatedReminderDue(clock({ status }), NOW)).toBe(false);
    }
  });

  it('skips an envelope whose signing window has closed', () => {
    expect(isAutomatedReminderDue(clock({ expiresAtMs: NOW }), NOW)).toBe(false);
    expect(isAutomatedReminderDue(clock({ expiresAtMs: NOW - 1 }), NOW)).toBe(false);
  });

  it('skips a signer who was never invited', () => {
    expect(isAutomatedReminderDue(clock({ invitedAtMs: null }), NOW)).toBe(false);
  });
});
