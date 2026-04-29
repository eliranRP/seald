import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'L1/Badge',
  component: Badge,
  tags: ['autodocs', 'layer-1'],
  args: { tone: 'neutral', children: 'Draft', dot: true },
};
export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge tone="indigo">Awaiting you</Badge>
      <Badge tone="amber">Awaiting others</Badge>
      <Badge tone="emerald">Completed</Badge>
      <Badge tone="red">Declined</Badge>
      <Badge tone="neutral">Draft</Badge>
      <Badge tone="emerald" dot={false}>
        No dot
      </Badge>
    </div>
  ),
};

export const WithInteraction: Story = {
  render: () => <Badge tone="emerald">Saved just now</Badge>,
};

export const Edge: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      <Badge tone="indigo">This label is unusually long to test wrapping</Badge>
      <Badge tone="neutral">חתום</Badge>
      <Badge tone="amber"> </Badge>
    </div>
  ),
};
