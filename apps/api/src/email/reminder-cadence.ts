import { MAX_AUTOMATED_REMINDERS } from 'shared';

/**
 * Second sentence of the reminder footer. Only automated sends include it.
 * The leading space joins it to "asked you to sign a document." Manual
 * reminders pass an empty string so the sentence is absent.
 * The cap is {@link MAX_AUTOMATED_REMINDERS}, the same number the sender
 * toggle shows.
 */
export const AUTOMATED_REMINDER_CADENCE = ` Unless the sender turns them off, Seald sends up to ${MAX_AUTOMATED_REMINDERS} automatic daily reminders; they stop sooner if you sign or decline, or when the request expires or is cancelled.`;
