import type { Meta, StoryObj } from '@storybook/react-vite';
import { Bell, Calendar, Users } from 'lucide-react';
import { InfoChip } from './InfoChip';

const meta: Meta<typeof InfoChip> = {
  title: 'L1/InfoChip',
  component: InfoChip,
  tags: ['autodocs', 'layer-1'],
  args: { children: 'Expires May 12', icon: Calendar },
};
export default meta;
type Story = StoryObj<typeof InfoChip>;

export const Default: Story = {};

export const Row: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <InfoChip icon={Users}>2 signers</InfoChip>
      <InfoChip icon={Calendar}>Expires May 12</InfoChip>
      <InfoChip icon={Bell}>Reminders on</InfoChip>
    </div>
  ),
};
