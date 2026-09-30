import { useState } from 'react';
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

function Frame({ width, enabled }: { readonly width: number; readonly enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  return (
    <div style={{ width, maxWidth: '100%' }}>
      <ReminderToggle enabled={on} onChange={setOn} />
    </div>
  );
}

/** 390px phone width. Storybook has no global viewport preset here. */
export const Mobile: Story = {
  render: () => <Frame width={390} enabled />,
};

/** 1440px desktop width, same control in the send rail. */
export const Desktop: Story = {
  render: () => <Frame width={1440} enabled={false} />,
};
