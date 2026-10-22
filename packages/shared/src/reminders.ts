/**
 * Automated reminders stop after this many per signer, even if the
 * request is still open. The API cap, the reminder email footer, and
 * the sender toggle help text all read this value.
 */
export const MAX_AUTOMATED_REMINDERS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's behaviour: the first reminder one day after the invite, then daily, at most 7. */
export const DEFAULT_REMINDER_CADENCE = {
  firstAfterDays: 1,
  intervalDays: 1,
  maxReminders: MAX_AUTOMATED_REMINDERS,
} as const;

export interface ReminderCadence {
  /** Days after the invite before the first automated reminder. */
  readonly firstAfterDays: number;
  /** Days between automated reminders after the first. */
  readonly intervalDays: number;
  /** Automated reminders per signer, 1 to {@link MAX_AUTOMATED_REMINDERS}. */
  readonly maxReminders: number;
}

/** Inclusive bounds the API DTO and the send controls both enforce. */
export const REMINDER_CADENCE_BOUNDS = {
  firstAfterDays: { min: 1, max: 30 },
  intervalDays: { min: 1, max: 30 },
  maxReminders: { min: 1, max: MAX_AUTOMATED_REMINDERS },
} as const;

/** Presets offered by the "Expires in" control, in days from now. */
export const EXPIRY_PRESET_DAYS = [7, 14, 30, 60, 90] as const;
/** Smallest expiry the sender may choose: one day from now. */
export const EXPIRY_MIN_DAYS = 1;
/** Largest expiry: the end of the UTC day this many days from today. */
export const EXPIRY_MAX_DAYS = 90;

/** How the sender picked the expiry: N days from now, or a calendar date (UTC, `YYYY-MM-DD`). */
export type ExpirySelection =
  | { readonly kind: 'days'; readonly days: number }
  | { readonly kind: 'date'; readonly date: string };

function isIntInRange(value: number, bounds: { readonly min: number; readonly max: number }) {
  return Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

export function isReminderCadenceValid(cadence: ReminderCadence): boolean {
  const { firstAfterDays, intervalDays, maxReminders } = cadence;
  return (
    isIntInRange(firstAfterDays, REMINDER_CADENCE_BOUNDS.firstAfterDays) &&
    isIntInRange(intervalDays, REMINDER_CADENCE_BOUNDS.intervalDays) &&
    isIntInRange(maxReminders, REMINDER_CADENCE_BOUNDS.maxReminders)
  );
}

function dayCount(n: number): string {
  return n === 1 ? '1 day' : `${String(n)} days`;
}

/**
 * Sentence fragment that describes the schedule, e.g.
 * "up to 7 automatic daily reminders" for the default cadence.
 */
export function reminderCadenceSummary(cadence: ReminderCadence): string {
  const { firstAfterDays, intervalDays, maxReminders } = cadence;
  const count = `up to ${String(maxReminders)} automatic`;
  if (firstAfterDays === 1 && intervalDays === 1) {
    return `${count} daily reminders`;
  }
  return `${count} reminders, starting ${dayCount(firstAfterDays)} after sending and then every ${dayCount(intervalDays)}`;
}

/** Start of the UTC day containing `nowMs`, in epoch milliseconds. */
function utcDayStartMs(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Latest instant an expiry may take: the end of the UTC day {@link EXPIRY_MAX_DAYS} from today. */
export function expiryMaxMs(nowMs: number): number {
  return utcDayStartMs(nowMs) + (EXPIRY_MAX_DAYS + 1) * DAY_MS - 1;
}

export function isExpiryWithinBounds(expiresAtMs: number, nowMs: number): boolean {
  return (
    Number.isFinite(expiresAtMs) &&
    expiresAtMs - nowMs >= EXPIRY_MIN_DAYS * DAY_MS &&
    expiresAtMs <= expiryMaxMs(nowMs)
  );
}

/** Resolves the sender's choice to an ISO timestamp. */
export function resolveExpiresAt(selection: ExpirySelection, nowMs: number): string {
  if (selection.kind === 'days') {
    return new Date(nowMs + selection.days * DAY_MS).toISOString();
  }
  return `${selection.date}T23:59:59.999Z`;
}

/** Earliest and latest calendar dates (UTC, `YYYY-MM-DD`) the date picker may offer. */
export function expiryDateBounds(nowMs: number): { readonly min: string; readonly max: string } {
  const today = utcDayStartMs(nowMs);
  return {
    min: new Date(today + DAY_MS).toISOString().slice(0, 10),
    max: new Date(today + EXPIRY_MAX_DAYS * DAY_MS).toISOString().slice(0, 10),
  };
}
