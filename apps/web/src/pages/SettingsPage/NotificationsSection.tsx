import { Bell, CheckCircle2, Clock, Lock, PenLine, XCircle, type LucideIcon } from 'lucide-react';
import { DEFAULT_USER_SETTINGS, type ExpiryDefaultDays, type ReminderDefault } from 'shared';
import { Icon } from '@/components/Icon';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Switch } from '@/components/Switch';
import {
  Eyebrow,
  Lock as LockMark,
  Row,
  RowIcon,
  RowLabel,
  RowSegmented,
  RowsCard,
  Section,
  Spacer,
} from './SettingsPage.styles';
import { useUpdateUserSettings, useUserSettings } from './userSettingsApi';

const REMINDER_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: '2d', label: '2 days' },
  { value: '3d', label: '3 days' },
  { value: 'weekly', label: 'Weekly' },
] as const satisfies ReadonlyArray<{ value: ReminderDefault; label: string }>;

const EXPIRY_OPTIONS = [
  { value: '7', label: '7' },
  { value: '14', label: '14' },
  { value: '30', label: '30' },
  { value: '60', label: '60 days' },
] as const;

interface SwitchRow {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly locked: boolean;
}

const ROWS: ReadonlyArray<SwitchRow> = [
  { id: 'signed', label: 'Someone signs', icon: PenLine, locked: false },
  { id: 'completed', label: 'Completed', icon: CheckCircle2, locked: true },
  { id: 'declined', label: 'Declined, expired, bounced', icon: XCircle, locked: true },
  // "Daily summary" stays hidden until the daily-summary email exists; the
  // `notify.daily_summary` preference is kept in the API for it.
];

/**
 * Notifications and the two defaults Prepare and Use template start from.
 * Every control saves at once (the cache moves first and rolls back on
 * failure). Completed and Declined / expired / bounced are always on.
 */
export function NotificationsSection() {
  const settings = useUserSettings();
  const update = useUpdateUserSettings();
  const current = settings.data ?? DEFAULT_USER_SETTINGS;

  function isOn(row: SwitchRow): boolean {
    if (row.locked) return true;
    return current.notify.signed;
  }

  function toggle(row: SwitchRow, on: boolean): void {
    if (row.locked) return;
    update.mutate({ notify: { signed: on } });
  }

  return (
    <Section aria-label="Notifications">
      <Eyebrow $mobileHidden>Notify me</Eyebrow>
      <RowsCard>
        {ROWS.map((row, i) => (
          <Row key={row.id} $last={i === ROWS.length - 1}>
            <RowIcon>
              <Icon icon={row.icon} size={14} />
            </RowIcon>
            <RowLabel>{row.label}</RowLabel>
            {row.locked ? (
              <LockMark title="Always on">
                <Icon icon={Lock} size={12} label="Always on" />
              </LockMark>
            ) : null}
            <Spacer />
            <Switch
              label={row.label}
              checked={isOn(row)}
              disabled={row.locked}
              onChange={(on) => toggle(row, on)}
            />
          </Row>
        ))}
      </RowsCard>

      <Eyebrow $mobileGroup>Defaults</Eyebrow>
      <RowsCard>
        <Row $min={64} $wrap>
          <RowIcon>
            <Icon icon={Bell} size={14} />
          </RowIcon>
          <RowLabel>Reminders</RowLabel>
          <Spacer />
          <RowSegmented>
            <SegmentedControl
              aria-label="Reminders"
              options={REMINDER_OPTIONS}
              value={current.reminder_default}
              onChange={(reminder_default) => update.mutate({ reminder_default })}
            />
          </RowSegmented>
        </Row>
        <Row $last $min={64} $wrap>
          <RowIcon>
            <Icon icon={Clock} size={14} />
          </RowIcon>
          <RowLabel>Expires after</RowLabel>
          <Spacer />
          <RowSegmented>
            <SegmentedControl
              aria-label="Expires after"
              options={EXPIRY_OPTIONS}
              value={String(current.expiry_default_days)}
              onChange={(days) =>
                update.mutate({ expiry_default_days: Number(days) as ExpiryDefaultDays })
              }
            />
          </RowSegmented>
        </Row>
      </RowsCard>
    </Section>
  );
}
