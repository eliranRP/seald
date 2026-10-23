import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { DEFAULT_SEND_REMINDER_SETTINGS } from '@/features/envelopes/sendReminderSettings';
import { LocaleSettings } from './LocaleSettings';

const meta: Meta<typeof LocaleSettings> = {
  title: 'L2/LocaleSettings',
  component: LocaleSettings,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
  args: {
    value: DEFAULT_SEND_REMINDER_SETTINGS,
    onChange: () => undefined,
  },
  decorators: [
    (Story) => {
      // Stories render with the flag on so the control is visible.
      (
        globalThis as unknown as { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> }
      ).__SEALD_FEATURE_OVERRIDES__ = { i18n: true };
      return <Story />;
    },
  ],
};
export default meta;
type Story = StoryObj<typeof LocaleSettings>;

/** One supported locale today, so the select is disabled and reads English. */
export const EnglishOnly: Story = {};
