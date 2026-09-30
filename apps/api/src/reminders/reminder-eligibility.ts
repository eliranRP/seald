/** Unsigned signers are reminded once per this window, measured from the later of invite, last reminder mail, and last_reminded_at. */
export const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface ReminderClock {
  /** Envelope status. Only `awaiting_others` is eligible. */
  readonly status: string;
  readonly remindersEnabled: boolean;
  readonly expiresAtMs: number;
  readonly signedAt: string | null;
  readonly declinedAt: string | null;
  /** When the signing link was last issued (invite or manual token rotation). */
  readonly invitedAtMs: number | null;
  readonly lastRemindedAtMs: number | null;
  /** created_at of the newest invite or reminder outbox row, if any. */
  readonly lastMailAtMs: number | null;
}

/**
 * Whether an automated reminder should be queued for one signer at `nowMs`.
 * Terminal envelopes, disabled reminders, signed or declined signers, and
 * anyone reminded (or invited) inside the last 24 hours are not due.
 */
export function isAutomatedReminderDue(clock: ReminderClock, nowMs: number): boolean {
  if (clock.status !== 'awaiting_others') return false;
  if (!clock.remindersEnabled) return false;
  if (!(clock.expiresAtMs > nowMs)) return false;
  if (clock.signedAt !== null) return false;
  if (clock.declinedAt !== null) return false;
  if (clock.invitedAtMs === null) return false;

  const anchors = [clock.invitedAtMs, clock.lastRemindedAtMs, clock.lastMailAtMs].filter(
    (value): value is number => value !== null,
  );
  const latest = Math.max(...anchors);
  return nowMs - latest >= REMINDER_INTERVAL_MS;
}
