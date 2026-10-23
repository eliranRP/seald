import { useId } from 'react';
import type { JSX } from 'react';
import { Bell, Clock, Send, ShieldCheck, X } from 'lucide-react';
import { EXPIRY_PRESET_DAYS } from 'shared';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { Button } from '../Button';
import { DialogBackdrop, DialogBody, DialogFoot, DialogHead } from '../DialogPrimitives';
import { Disclosure } from '../Disclosure';
import { MWBottomSheet } from '../MWBottomSheet';
import { SegmentedControl } from '../SegmentedControl';
import type { ReminderChoice, SendOptionsDialogProps } from './SendOptionsDialog.types';
import {
  Advanced,
  Avatars,
  Card,
  Dot,
  Meta,
  RecipientsRow,
  SealBadge,
  Select,
  SettingIcon,
  SettingLabel,
  SettingRow,
  Stack,
  Title,
} from './SendOptionsDialog.styles';

const CUSTOM_EXPIRY = 'custom';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => (p[0] ?? '').toUpperCase())
    .slice(0, 2)
    .join('');
}

function choiceOf(enabled: boolean, intervalDays: number): ReminderChoice {
  if (!enabled) return 'off';
  return intervalDays >= 7 ? 'weekly' : 'every3';
}

/**
 * The Send options sheet: who gets it, how often to remind them and when it
 * expires, with the defaults already set (reminders every 3 days, expires
 * in 30). "Send now" goes out with whatever is shown. A dialog on desktop,
 * a bottom sheet on phones.
 */
export function SendOptionsDialog(props: SendOptionsDialogProps): JSX.Element | null {
  const {
    open,
    onClose,
    onSend,
    sendLabel = 'Send now',
    recipients,
    ordered = false,
    remindersEnabled,
    onRemindersEnabledChange,
    cadence,
    onCadenceChange,
    expiry,
    onExpiryChange,
    advanced,
  } = props;
  const titleId = useId();
  const isMobile = useIsMobileViewport();
  useEscapeKey(onClose, open && !isMobile);

  if (!open) return null;

  const choice = choiceOf(remindersEnabled, cadence.intervalDays);
  const setChoice = (next: ReminderChoice): void => {
    if (next === 'off') {
      onRemindersEnabledChange(false);
      return;
    }
    const days = next === 'weekly' ? 7 : 3;
    onRemindersEnabledChange(true);
    onCadenceChange({ ...cadence, firstAfterDays: days, intervalDays: days });
  };

  const expiryValue = expiry.kind === 'days' ? String(expiry.days) : CUSTOM_EXPIRY;
  const presetDays: ReadonlyArray<number> =
    expiry.kind === 'days' && !EXPIRY_PRESET_DAYS.some((d) => d === expiry.days)
      ? [...EXPIRY_PRESET_DAYS, expiry.days].sort((a, b) => a - b)
      : EXPIRY_PRESET_DAYS;

  const count = recipients.length;
  const summary = `${String(count)} ${count === 1 ? 'signer' : 'signers'} · ${ordered ? 'in order' : 'in any order'}`;

  const body = (
    <Stack>
      <RecipientsRow>
        <Avatars aria-hidden>
          {recipients.slice(0, 5).map((r) => (
            <Dot key={r.id} $color={r.color}>
              {initials(r.name)}
            </Dot>
          ))}
        </Avatars>
        <Meta>{summary}</Meta>
      </RecipientsRow>
      <div>
        <SettingRow>
          <SettingIcon aria-hidden>
            <Bell size={16} />
          </SettingIcon>
          <SettingLabel>Reminders</SettingLabel>
          <SegmentedControl<ReminderChoice>
            aria-label="Reminders"
            value={choice}
            onChange={setChoice}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'every3', label: 'Every 3 days' },
              { value: 'weekly', label: 'Weekly' },
            ]}
          />
        </SettingRow>
        <SettingRow>
          <SettingIcon aria-hidden>
            <Clock size={16} />
          </SettingIcon>
          <SettingLabel>Expires</SettingLabel>
          <Select
            aria-label="Expires"
            value={expiryValue}
            onChange={(e) => {
              const v = e.target.value;
              if (v === CUSTOM_EXPIRY) return;
              onExpiryChange({ kind: 'days', days: Number(v) });
            }}
          >
            {presetDays.map((d) => (
              <option key={d} value={String(d)}>
                {`In ${String(d)} days`}
              </option>
            ))}
            {expiry.kind === 'date' ? (
              <option value={CUSTOM_EXPIRY}>{`On ${expiry.date}`}</option>
            ) : null}
          </Select>
        </SettingRow>
        <SettingRow>
          <SettingIcon aria-hidden>
            <ShieldCheck size={16} />
          </SettingIcon>
          <SettingLabel>Seal</SettingLabel>
          <SealBadge>PAdES B-LT</SealBadge>
        </SettingRow>
      </div>
      {advanced ? (
        <Disclosure label="More options">
          <Advanced>{advanced}</Advanced>
        </Disclosure>
      ) : null}
    </Stack>
  );

  if (isMobile) {
    return (
      <MWBottomSheet open onClose={onClose} title="Send options">
        {body}
        <DialogFoot>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" iconLeft={Send} onClick={onSend}>
            {sendLabel}
          </Button>
        </DialogFoot>
      </MWBottomSheet>
    );
  }

  return (
    <DialogBackdrop role="presentation" onClick={onClose}>
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHead>
          <Title id={titleId}>Send options</Title>
          <Button variant="ghost" iconOnly iconLeft={X} aria-label="Close" onClick={onClose} />
        </DialogHead>
        <DialogBody>{body}</DialogBody>
        <DialogFoot>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" iconLeft={Send} onClick={onSend}>
            {sendLabel}
          </Button>
        </DialogFoot>
      </Card>
    </DialogBackdrop>
  );
}
