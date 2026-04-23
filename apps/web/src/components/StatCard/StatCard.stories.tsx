import type { Meta, StoryObj } from '@storybook/react';
import { StatCard } from './StatCard';

const meta: Meta<typeof StatCard> = {
  title: 'L1/StatCard',
  component: StatCard,
  tags: ['autodocs', 'layer-1'],
  args: { label: 'Awaiting you', value: '12', tone: 'indigo' },
};
export default meta;
type Story = StoryObj<typeof StatCard>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, width: 720 }}>
      <StatCard label="Awaiting you" value="4" tone="indigo" />
      <StatCard label="Awaiting others" value="7" tone="amber" />
      <StatCard label="Completed this month" value="18" tone="emerald" />
      <StatCard label="Total" value="34" tone="neutral" />
    </div>
  ),
};

export const Edge: Story = {
  render: () => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, width: 480 }}>
      <StatCard label="Zero" value="0" tone="neutral" />
      <StatCard label="Very large" value="1,204,983" tone="emerald" />
    </div>
  ),
};
