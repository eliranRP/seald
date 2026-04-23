import type { Meta, StoryObj } from '@storybook/react';
import { Skeleton } from './Skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'L1/Skeleton',
  component: Skeleton,
  tags: ['autodocs', 'layer-1'],
  args: { variant: 'text', width: 240, height: 14 },
};
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {};

export const Rect: Story = {
  args: { variant: 'rect', width: 160, height: 64 },
};

export const Circle: Story = {
  args: { variant: 'circle', width: 40, height: 40 },
};

export const NotAnimated: Story = {
  args: { animated: false },
};

export const RowPlaceholder: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 100px 80px',
        gap: 12,
        padding: 12,
        borderRadius: 12,
        border: '1px solid #E5E7EB',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Skeleton variant="circle" width={32} height={32} />
        <Skeleton width={140} />
      </div>
      <Skeleton width={180} />
      <Skeleton width={80} />
      <Skeleton width={60} />
    </div>
  ),
};
