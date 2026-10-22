import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { DEFAULT_SEND_REMINDER_SETTINGS } from '@/features/envelopes/sendReminderSettings';
import { DateFormatSettings } from './DateFormatSettings';

const meta: Meta<typeof DateFormatSettings> = {
  title: 'L2/DateFormatSettings',
  component: DateFormatSettings,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
  args: {
    value: DEFAULT_SEND_REMINDER_SETTINGS,
    onChange: () => undefined,
    nowMs: Date.parse('2026-10-22T10:00:00.000Z'),
  },
  decorators: [
    (Story) => {
      // Stories render with the flag on so the controls are visible.
      (
        globalThis as unknown as { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> }
      ).__SEALD_FEATURE_OVERRIDES__ = { fieldMetaV2: true };
      return <Story />;
    },
  ],
};
export default meta;
type Story = StoryObj<typeof DateFormatSettings>;

export const Defaults: Story = {};

export const DayFirstInJerusalem: Story = {
  args: {
    value: {
      ...DEFAULT_SEND_REMINDER_SETTINGS,
      dateFormat: 'dd/MM/yyyy',
      timezone: 'Asia/Jerusalem',
    },
  },
};
