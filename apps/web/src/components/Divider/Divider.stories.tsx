import type { Meta, StoryObj } from '@storybook/react';
import { Divider } from './Divider';

const meta: Meta<typeof Divider> = {
  title: 'L1/Divider',
  component: Divider,
  tags: ['autodocs', 'layer-1'],
  args: { label: 'or' },
};
export default meta;
type Story = StoryObj<typeof Divider>;

export const Default: Story = {};

export const NoLabel: Story = {
  args: { label: undefined },
};

export const CustomLabel: Story = {
  args: { label: 'and' },
};
