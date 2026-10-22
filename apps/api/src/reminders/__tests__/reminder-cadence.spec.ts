import { DEFAULT_REMINDER_CADENCE, MAX_AUTOMATED_REMINDERS } from 'shared';
import { automatedReminderCadence, AUTOMATED_REMINDER_CADENCE } from '../../email/reminder-cadence';
import {
  REMINDER_INTERVAL_MS,
  isAutomatedReminderDue,
  reminderCadenceFor,
  type ReminderClock,
} from '../reminder-eligibility';

const DAY = REMINDER_INTERVAL_MS;
const INVITED = Date.parse('2026-05-01T12:00:00.000Z');

/** Invited at INVITED, no later mail, nothing automated sent yet. */
function clock(overrides: Partial<ReminderClock> = {}): ReminderClock {
  return {
    status: 'awaiting_others',
    remindersEnabled: true,
    expiresAtMs: INVITED + 60 * DAY,
    signedAt: null,
    declinedAt: null,
    invitedAtMs: INVITED,
    lastRemindedAtMs: null,
    lastMailAtMs: INVITED,
    ...overrides,
  };
}

describe('per-envelope reminder cadence (WP-09)', () => {
  describe('eligibility table', () => {
    const cases: ReadonlyArray<{
      name: string;
      cadence: { firstAfterDays: number; intervalDays: number; maxReminders: number };
      automatedSent: number;
      anchorDaysAgo: number;
      due: boolean;
    }> = [
      {
        name: 'default: due after 1 day with nothing sent',
        cadence: { ...DEFAULT_REMINDER_CADENCE },
        automatedSent: 0,
        anchorDaysAgo: 1,
        due: true,
      },
      {
        name: 'default: not due at 23 hours after the invite',
        cadence: { ...DEFAULT_REMINDER_CADENCE },
        automatedSent: 0,
        anchorDaysAgo: 23 / 24,
        due: false,
      },
      {
        name: 'first after 3 days: not due at 2 days',
        cadence: { firstAfterDays: 3, intervalDays: 1, maxReminders: 7 },
        automatedSent: 0,
        anchorDaysAgo: 2,
        due: false,
      },
      {
        name: 'first after 3 days: due at 3 days',
        cadence: { firstAfterDays: 3, intervalDays: 1, maxReminders: 7 },
        automatedSent: 0,
        anchorDaysAgo: 3,
        due: true,
      },
      {
        name: 'then every 4 days: one sent, not due at 3 days since last anchor',
        cadence: { firstAfterDays: 1, intervalDays: 4, maxReminders: 7 },
        automatedSent: 1,
        anchorDaysAgo: 3,
        due: false,
      },
      {
        name: 'then every 4 days: due at 4 days since last anchor',
        cadence: { firstAfterDays: 1, intervalDays: 4, maxReminders: 7 },
        automatedSent: 1,
        anchorDaysAgo: 4,
        due: true,
      },
      {
        name: 'cap reached: never due',
        cadence: { firstAfterDays: 1, intervalDays: 1, maxReminders: 2 },
        automatedSent: 2,
        anchorDaysAgo: 30,
        due: false,
      },
      {
        name: 'cap of 1: first reminder then stop',
        cadence: { firstAfterDays: 2, intervalDays: 1, maxReminders: 1 },
        automatedSent: 1,
        anchorDaysAgo: 10,
        due: false,
      },
    ];

    it.each(cases)('$name', ({ cadence, automatedSent, anchorDaysAgo, due }) => {
      const now = INVITED + 10 * DAY;
      // The most recent anchor sits exactly anchorDaysAgo before now.
      const anchor = now - anchorDaysAgo * DAY;
      const result = isAutomatedReminderDue(
        clock({
          cadence,
          automatedSent,
          invitedAtMs: automatedSent === 0 ? anchor : INVITED,
          lastRemindedAtMs: automatedSent > 0 ? anchor : null,
          lastMailAtMs: anchor,
          expiresAtMs: now + 60 * DAY,
        }),
        now,
      );
      expect(result).toBe(due);
    });

    it('uses the default cadence when none is supplied (today behaviour)', () => {
      const base = clock();
      expect(isAutomatedReminderDue(base, INVITED + DAY - 1)).toBe(false);
      expect(isAutomatedReminderDue(base, INVITED + DAY)).toBe(true);
      expect(
        isAutomatedReminderDue(
          clock({ automatedSent: MAX_AUTOMATED_REMINDERS }),
          INVITED + 30 * DAY,
        ),
      ).toBe(false);
    });
  });

  describe('reminderCadenceFor', () => {
    it('falls back to defaults for a row without cadence columns', () => {
      expect(reminderCadenceFor({})).toEqual(DEFAULT_REMINDER_CADENCE);
    });

    it('reads the envelope columns when present', () => {
      expect(
        reminderCadenceFor({
          reminder_first_after_days: 5,
          reminder_interval_days: 2,
          reminder_max: 3,
        }),
      ).toEqual({ firstAfterDays: 5, intervalDays: 2, maxReminders: 3 });
    });
  });

  describe('email footer', () => {
    it('keeps the default sentence byte-for-byte', () => {
      expect(AUTOMATED_REMINDER_CADENCE).toBe(
        ` Unless the sender turns them off, Seald sends up to ${MAX_AUTOMATED_REMINDERS} automatic daily reminders; they stop sooner if you sign or decline, or when the request expires or is cancelled.`,
      );
      expect(automatedReminderCadence(DEFAULT_REMINDER_CADENCE)).toBe(AUTOMATED_REMINDER_CADENCE);
    });

    it('describes a custom schedule', () => {
      expect(
        automatedReminderCadence({ firstAfterDays: 3, intervalDays: 2, maxReminders: 4 }),
      ).toContain(
        'Seald sends up to 4 automatic reminders, starting 3 days after sending and then every 2 days;',
      );
    });
  });
});
