import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { ReminderToggle } from './ReminderToggle';

const meta: Meta<typeof ReminderToggle> = {
  title: 'L2/ReminderToggle',
  component: ReminderToggle,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
  args: { enabled: true, onChange: () => undefined },
};
export default meta;
type Story = StoryObj<typeof ReminderToggle>;

export const Enabled: Story = {};

export const DisabledReminders: Story = {
  args: { enabled: false },
};

export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};

export const Desktop: Story = {
  args: { enabled: false },
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
};
