import { useId } from 'react';
import {
  DATE_FORMATS,
  calendarDateInZone,
  formatCalendarDate,
  isDateFormat,
  isFeatureEnabled,
  isValidTimeZone,
} from 'shared';
import { Control, Field, Hint, Label, Legend, Root } from './DateFormatSettings.styles';
import type { DateFormatSettingsProps } from './DateFormatSettings.types';

const COMMON_ZONES: ReadonlyArray<string> = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Jerusalem',
  'Asia/Tokyo',
  'Australia/Sydney',
];

/** The browser's own zone when valid, so the sender can pick "where I am". */
function browserZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}

function zoneChoices(current: string | undefined): ReadonlyArray<string> {
  const own = browserZone();
  const out: string[] = [];
  for (const z of [own, ...COMMON_ZONES, current]) {
    if (z !== null && z !== undefined && z !== '' && !out.includes(z)) out.push(z);
  }
  return out;
}

/**
 * Envelope-level date rendering for the send step (WP-08): the format date
 * fields are written in and the timezone "today" is read in. Hidden while
 * `fieldMetaV2` is off. Leaving either on "Keep what the signer enters"
 * sends nothing, so the envelope behaves as it does today.
 */
export function DateFormatSettings({
  value,
  onChange,
  disabled = false,
  nowMs,
}: DateFormatSettingsProps) {
  const formatId = useId();
  const zoneId = useId();
  const hintId = useId();
  if (!isFeatureEnabled('fieldMetaV2')) return null;

  const format = isDateFormat(value.dateFormat) ? value.dateFormat : '';
  const zone = value.timezone ?? '';
  const now = new Date(nowMs ?? Date.now());
  const sampleZone = zone !== '' && isValidTimeZone(zone) ? zone : null;
  const sample =
    format !== '' ? formatCalendarDate(calendarDateInZone(now, sampleZone), format) : null;

  return (
    <Root disabled={disabled}>
      <Legend>Date fields</Legend>
      <Field>
        <Label htmlFor={formatId}>Date format</Label>
        <Control
          id={formatId}
          value={format}
          aria-describedby={hintId}
          onChange={(event) => onChange({ ...value, dateFormat: event.target.value })}
        >
          <option value="">Keep what the signer enters</option>
          {DATE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {formatCalendarDate({ year: 2026, month: 3, day: 9 }, f)}
            </option>
          ))}
        </Control>
      </Field>
      <Field>
        <Label htmlFor={zoneId}>Timezone</Label>
        <Control
          id={zoneId}
          value={zone}
          aria-describedby={hintId}
          onChange={(event) => onChange({ ...value, timezone: event.target.value })}
        >
          <option value="">Keep what the signer enters</option>
          {zoneChoices(value.timezone).map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </Control>
      </Field>
      <Hint id={hintId}>
        {sample !== null
          ? `Today would read ${sample}. Dates a signer enters are rewritten in this format.`
          : 'Dates stay exactly as the signer enters them.'}
      </Hint>
    </Root>
  );
}
