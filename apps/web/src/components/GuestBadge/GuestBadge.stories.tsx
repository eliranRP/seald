import type { Meta, StoryObj } from '@storybook/react';
import { GuestBadge } from './GuestBadge';

const meta: Meta<typeof GuestBadge> = {
  title: 'L1/GuestBadge',
  component: GuestBadge,
  tags: ['autodocs', 'layer-1'],
};
export default meta;
type Story = StoryObj<typeof GuestBadge>;

export const Default: Story = {};

export const CustomLabel: Story = {
  args: { label: 'Visitor' },
};
