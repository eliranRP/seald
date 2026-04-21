import type { Meta, StoryObj } from '@storybook/react';
import { StatusBadge } from './StatusBadge';
import { SIGNER_STATUSES } from '../../types/sealdTypes';

const meta: Meta<typeof StatusBadge> = {
  title: 'L2/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs', 'layer-2'],
  args: { status: 'awaiting-you' },
};
export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {SIGNER_STATUSES.map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
    </div>
  ),
};

export const WithInteraction: Story = {
  render: () => <StatusBadge status="completed" />,
};

export const Edge: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <StatusBadge status="expired" />
      <StatusBadge status="draft" />
    </div>
  ),
};
