import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Send, ArrowRight } from 'lucide-react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'L1/Button',
  component: Button,
  tags: ['autodocs', 'layer-1'],
  args: { children: 'Send for signature', variant: 'primary', size: 'md' },
};
export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {};

export const Dark: Story = {
  args: { variant: 'dark', children: 'Dark' },
};

export const AllVariants: Story = {
  render: () => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, auto)',
        gap: 12,
        alignItems: 'center',
      }}
    >
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Decline to sign</Button>
      <Button variant="dark">Dark</Button>
      <Button variant="primary" size="sm">
        Small
      </Button>
      <Button variant="primary" size="lg" iconRight={ArrowRight}>
        Large
      </Button>
      <Button variant="primary" iconLeft={Send}>
        With icon
      </Button>
      <Button variant="primary" loading>
        Loading
      </Button>
    </div>
  ),
};

function InteractionDemo() {
  const [count, setCount] = useState(0);
  return <Button onClick={() => setCount((c) => c + 1)}>Clicked {count} times</Button>;
}

export const WithInteraction: Story = {
  render: () => <InteractionDemo />,
};

export const Edge: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <Button>A</Button>
      <Button fullWidth>Full width in a 200px parent</Button>
      <Button>חתום עכשיו</Button>
    </div>
  ),
};
