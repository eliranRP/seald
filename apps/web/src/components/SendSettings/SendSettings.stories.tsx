import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { DEFAULT_SEND_REMINDER_SETTINGS } from '@/features/envelopes/sendReminderSettings';
import { SendSettings } from './SendSettings';

const meta: Meta<typeof SendSettings> = {
  title: 'L2/SendSettings',
  component: SendSettings,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
  args: { value: DEFAULT_SEND_REMINDER_SETTINGS, onChange: () => undefined },
  decorators: [
    (Story) => {
      // Stories render with the flag on so the controls are visible.
      (
        globalThis as unknown as { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> }
      ).__SEALD_FEATURE_OVERRIDES__ = { customReminders: true };
      return <Story />;
    },
  ],
};
export default meta;
type Story = StoryObj<typeof SendSettings>;

export const Defaults: Story = {};

export const CustomSchedule: Story = {
  args: {
    value: {
      expiry: { kind: 'days', days: 14 },
      cadence: { firstAfterDays: 3, intervalDays: 2, maxReminders: 4 },
    },
  },
};

export const CustomDate: Story = {
  args: {
    value: {
      expiry: { kind: 'date', date: '2026-11-30' },
      cadence: DEFAULT_SEND_REMINDER_SETTINGS.cadence,
    },
    nowMs: Date.parse('2026-10-22T10:00:00.000Z'),
  },
};

export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};

export const Disabled: Story = {
  args: { disabled: true },
};
