import { DEFAULT_REMINDER_CADENCE, reminderCadenceSummary, type ReminderCadence } from 'shared';

/**
 * Second sentence of the reminder footer. Only automated sends include it.
 * The leading space joins it to "asked you to sign a document." Manual
 * reminders pass an empty string so the sentence is absent.
 * The schedule and cap come from the envelope's cadence (WP-09). With the
 * default cadence the sentence is the same as it was before cadence existed.
 */
export function automatedReminderCadence(
  cadence: ReminderCadence = DEFAULT_REMINDER_CADENCE,
): string {
  return ` Unless the sender turns them off, Seald sends ${reminderCadenceSummary(cadence)}; they stop sooner if you sign or decline, or when the request expires or is cancelled.`;
}

export const AUTOMATED_REMINDER_CADENCE = automatedReminderCadence();
