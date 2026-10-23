import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { Switch } from './Switch';

const meta: Meta<typeof Switch> = {
  title: 'L1/Switch',
  component: Switch,
  tags: ['autodocs', 'layer-1'],
  parameters: { chromatic: { modes: chromaticViewportModes } },
  args: { label: 'Send a webhook', checked: false, onChange: () => undefined },
};
export default meta;
type Story = StoryObj<typeof Switch>;

export const Off: Story = {};

export const On: Story = { args: { checked: true } };

export const Pending: Story = { args: { checked: true, pending: true } };

export const Disabled: Story = { args: { disabled: true } };

export const Interactive: Story = {
  render: (args) => {
    const [on, setOn] = useState(false);
    return <Switch {...args} checked={on} onChange={setOn} />;
  },
};
