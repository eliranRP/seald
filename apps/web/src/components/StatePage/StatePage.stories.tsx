import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertTriangle, Settings } from 'lucide-react';
import { Button } from '../Button';
import { StatePage } from './StatePage';

const meta: Meta<typeof StatePage> = {
  title: 'L1/StatePage',
  component: StatePage,
  tags: ['autodocs', 'layer-1'],
  args: { title: 'Page not found', code: '404' },
};
export default meta;
type Story = StoryObj<typeof StatePage>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16 }}>
      <StatePage code="404" title="Page not found">
        <Button>Go to documents</Button>
      </StatePage>
      <StatePage icon={AlertTriangle} tone="bad" title="Something broke">
        <Button>Try again</Button>
      </StatePage>
      <StatePage icon={Settings} tone="warn" title="Back soon" />
    </div>
  ),
};

export const Edge: Story = {
  args: {
    code: undefined,
    icon: AlertTriangle,
    tone: 'bad',
    title: 'A very long title that wraps over several lines to check the layout holds up',
    description: 'A longer description line that should wrap and stay centred.',
  },
};
