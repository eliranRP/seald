import type { Meta, StoryObj } from '@storybook/react-vite';
import { OfflineBar } from './OfflineBar';

const meta: Meta<typeof OfflineBar> = {
  title: 'L1/OfflineBar',
  component: OfflineBar,
  tags: ['autodocs', 'layer-1'],
  args: { phase: 'offline' },
};
export default meta;
type Story = StoryObj<typeof OfflineBar>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 8 }}>
      <OfflineBar phase="offline" />
      <OfflineBar phase="reconnecting" />
      <OfflineBar phase="back" />
    </div>
  ),
};

export const Edge: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <OfflineBar phase="offline" />
    </div>
  ),
};
