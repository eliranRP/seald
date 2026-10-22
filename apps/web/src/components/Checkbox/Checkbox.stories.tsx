import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox';

const meta: Meta<typeof Checkbox> = {
  title: 'L1/Checkbox',
  component: Checkbox,
  tags: ['autodocs', 'layer-1'],
  args: { label: 'Read envelopes', checked: false, onChange: () => undefined },
};
export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {};

export const Checked: Story = { args: { checked: true } };

export const WithHint: Story = {
  args: { hint: 'Lets the key list and open your envelopes.', checked: true },
};

export const Disabled: Story = { args: { disabled: true } };

export const Interactive: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(false);
    return <Checkbox {...args} checked={checked} onChange={setChecked} />;
  },
};
