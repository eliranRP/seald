import { useId } from 'react';
import {
  EXPIRY_PRESET_DAYS,
  expiryDateBounds,
  isFeatureEnabled,
  REMINDER_CADENCE_BOUNDS,
  type ReminderCadence,
} from 'shared';
import { Control, Field, Hint, Label, Legend, NumberControl, Root } from './SendSettings.styles';
import type { SendSettingsProps } from './SendSettings.types';

const CUSTOM_EXPIRY = 'custom';

/** Whole number inside [min, max], or null when the entry is not usable. */
function parseInRange(raw: string, bounds: { readonly min: number; readonly max: number }) {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= bounds.min && n <= bounds.max ? n : null;
}

/**
 * Sender controls for expiry and reminder cadence (WP-09), rendered beside
 * the reminder switch on the send step. Hidden entirely while
 * `customReminders` is off. Out-of-range entries are not applied, so the
 * inputs fall back to the last valid value.
 */
export function SendSettings({ value, onChange, disabled = false, nowMs }: SendSettingsProps) {
  const expiryId = useId();
  const dateId = useId();
  const firstId = useId();
  const intervalId = useId();
  const maxId = useId();
  if (!isFeatureEnabled('customReminders')) return null;

  const now = nowMs ?? Date.now();
  const bounds = expiryDateBounds(now);
  const { cadence, expiry } = value;

  const setCadence = (patch: Partial<ReminderCadence>): void => {
    onChange({ ...value, cadence: { ...cadence, ...patch } });
  };

  return (
    <Root disabled={disabled}>
      <Legend>Expiry and reminders</Legend>
      <Field>
        <Label htmlFor={expiryId}>Expires in</Label>
        <Control
          id={expiryId}
          value={expiry.kind === 'date' ? CUSTOM_EXPIRY : String(expiry.days)}
          onChange={(event) => {
            const next = event.target.value;
            if (next === CUSTOM_EXPIRY) {
              onChange({ ...value, expiry: { kind: 'date', date: bounds.min } });
              return;
            }
            onChange({ ...value, expiry: { kind: 'days', days: Number(next) } });
          }}
        >
          {EXPIRY_PRESET_DAYS.map((days) => (
            <option key={days} value={String(days)}>
              {days} days
            </option>
          ))}
          <option value={CUSTOM_EXPIRY}>Custom date</option>
        </Control>
      </Field>
      {expiry.kind === 'date' ? (
        <Field>
          <Label htmlFor={dateId}>Expiry date</Label>
          <NumberControl
            id={dateId}
            type="date"
            min={bounds.min}
            max={bounds.max}
            value={expiry.date}
            onChange={(event) => {
              const date = event.target.value;
              if (date < bounds.min || date > bounds.max) return;
              onChange({ ...value, expiry: { kind: 'date', date } });
            }}
          />
        </Field>
      ) : null}
      <Field>
        <Label htmlFor={firstId}>First reminder after (days)</Label>
        <NumberControl
          id={firstId}
          type="number"
          inputMode="numeric"
          min={REMINDER_CADENCE_BOUNDS.firstAfterDays.min}
          max={REMINDER_CADENCE_BOUNDS.firstAfterDays.max}
          value={cadence.firstAfterDays}
          onChange={(event) => {
            const n = parseInRange(event.target.value, REMINDER_CADENCE_BOUNDS.firstAfterDays);
            if (n !== null) setCadence({ firstAfterDays: n });
          }}
        />
      </Field>
      <Field>
        <Label htmlFor={intervalId}>Then every (days)</Label>
        <NumberControl
          id={intervalId}
          type="number"
          inputMode="numeric"
          min={REMINDER_CADENCE_BOUNDS.intervalDays.min}
          max={REMINDER_CADENCE_BOUNDS.intervalDays.max}
          value={cadence.intervalDays}
          onChange={(event) => {
            const n = parseInRange(event.target.value, REMINDER_CADENCE_BOUNDS.intervalDays);
            if (n !== null) setCadence({ intervalDays: n });
          }}
        />
      </Field>
      <Field>
        <Label htmlFor={maxId}>Maximum reminders</Label>
        <NumberControl
          id={maxId}
          type="number"
          inputMode="numeric"
          min={REMINDER_CADENCE_BOUNDS.maxReminders.min}
          max={REMINDER_CADENCE_BOUNDS.maxReminders.max}
          value={cadence.maxReminders}
          onChange={(event) => {
            const n = parseInRange(event.target.value, REMINDER_CADENCE_BOUNDS.maxReminders);
            if (n !== null) setCadence({ maxReminders: n });
          }}
        />
      </Field>
      <Hint>Reminders stop at the maximum, when a signer signs or declines, or at expiry.</Hint>
    </Root>
  );
}
