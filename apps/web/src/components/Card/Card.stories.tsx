import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'L1/Card',
  component: Card,
  tags: ['autodocs', 'layer-1'],
  args: { children: 'Put your name to it.', elevated: false, padding: 6 },
};
export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(2, 1fr)' }}>
      <Card>Default (border + no shadow)</Card>
      <Card elevated>Elevated</Card>
      <Card padding={4}>Padding 4</Card>
      <Card padding={12}>Padding 12</Card>
    </div>
  ),
};

export const WithInteraction: Story = {
  render: () => <Card aria-label="Contract — NDA 2026">Interactive region</Card>,
};

export const Edge: Story = {
  render: () => (
    <Card>
      {Array.from({ length: 20 }, (_, i) => (
        <p key={`row-${i}`}>Row {i + 1}</p>
      ))}
    </Card>
  ),
};
