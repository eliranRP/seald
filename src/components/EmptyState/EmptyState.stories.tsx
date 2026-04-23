import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState } from './EmptyState';

const meta: Meta<typeof EmptyState> = {
  title: 'L1/EmptyState',
  component: EmptyState,
  tags: ['autodocs', 'layer-1'],
  args: { children: 'No documents match this filter.' },
};
export default meta;
type Story = StoryObj<typeof EmptyState>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, width: 480 }}>
      <EmptyState>No documents match this filter.</EmptyState>
      <EmptyState>No signers yet. Add one to get started.</EmptyState>
    </div>
  ),
};

export const Edge: Story = {
  render: () => (
    <EmptyState>
      A much longer empty state copy that wraps onto multiple lines to verify that the component
      handles narrow / tall content reasonably.
    </EmptyState>
  ),
};
