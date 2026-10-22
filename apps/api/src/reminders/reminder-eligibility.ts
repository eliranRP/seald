import { DEFAULT_REMINDER_CADENCE, type ReminderCadence } from 'shared';

export { MAX_AUTOMATED_REMINDERS } from 'shared';

/**
 * One reminder "day". Cadence values count in these units. Pinned at
 * 24 hours so the default cadence matches the pre-WP-09 daily sweep.
 */
export const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface ReminderClock {
  /** Envelope status. Only `awaiting_others` is eligible. */
  readonly status: string;
  readonly remindersEnabled: boolean;
  readonly expiresAtMs: number;
  readonly signedAt: string | null;
  readonly declinedAt: string | null;
  /** When the signing link was last issued (each dispatched invite or reminder mints one). */
  readonly invitedAtMs: number | null;
  readonly lastRemindedAtMs: number | null;
  /** created_at of the newest invite or reminder outbox row, if any. */
  readonly lastMailAtMs: number | null;
  /** Cadence in force for the envelope. Omitted means today's defaults. */
  readonly cadence?: ReminderCadence;
  /** Automated reminders already sent to this signer. Omitted means none. */
  readonly automatedSent?: number;
}

/**
 * Cadence for an envelope row. Columns missing from the row (flag dark, or
 * a pre-0025 read) fall back to today's defaults.
 */
export function reminderCadenceFor(envelope: {
  readonly reminder_first_after_days?: number | undefined;
  readonly reminder_interval_days?: number | undefined;
  readonly reminder_max?: number | undefined;
}): ReminderCadence {
  return {
    firstAfterDays: envelope.reminder_first_after_days ?? DEFAULT_REMINDER_CADENCE.firstAfterDays,
    intervalDays: envelope.reminder_interval_days ?? DEFAULT_REMINDER_CADENCE.intervalDays,
    maxReminders: envelope.reminder_max ?? DEFAULT_REMINDER_CADENCE.maxReminders,
  };
}

/**
 * Whether an automated reminder should be queued for one signer at `nowMs`.
 *
 * Terminal envelopes, disabled reminders, signed or declined signers, and
 * anyone who has already received the cap are not due. Otherwise the wait
 * is measured from the latest of invite, last reminder stamp and last mail:
 * `firstAfterDays` before the first automated reminder, then `intervalDays`
 * between later ones.
 */
export function isAutomatedReminderDue(clock: ReminderClock, nowMs: number): boolean {
  if (clock.status !== 'awaiting_others') return false;
  if (!clock.remindersEnabled) return false;
  if (!(clock.expiresAtMs > nowMs)) return false;
  if (clock.signedAt !== null) return false;
  if (clock.declinedAt !== null) return false;
  if (clock.invitedAtMs === null) return false;

  const cadence = clock.cadence ?? DEFAULT_REMINDER_CADENCE;
  const sent = clock.automatedSent ?? 0;
  if (sent >= cadence.maxReminders) return false;
  const waitDays = sent === 0 ? cadence.firstAfterDays : cadence.intervalDays;

  const anchors = [clock.invitedAtMs, clock.lastRemindedAtMs, clock.lastMailAtMs].filter(
    (value): value is number => value !== null,
  );
  const latest = Math.max(...anchors);
  return nowMs - latest >= waitDays * REMINDER_INTERVAL_MS;
}
