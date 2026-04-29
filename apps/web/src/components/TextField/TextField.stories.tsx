import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Mail } from 'lucide-react';
import { TextField } from './TextField';

const meta: Meta<typeof TextField> = {
  title: 'L1/TextField',
  component: TextField,
  tags: ['autodocs', 'layer-1'],
  args: { label: 'Email', placeholder: 'you@seald.app' },
};
export default meta;
type Story = StoryObj<typeof TextField>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
      <TextField label="Plain" />
      <TextField label="With help" helpText="We never share your email." />
      <TextField label="With icon" iconLeft={Mail} />
      <TextField label="With error" error="Email is required" />
      <TextField label="Disabled" disabled value="read-only" />
    </div>
  ),
};

function InteractionDemo() {
  const [v, setV] = useState('');
  return <TextField label="Name" value={v} onChange={setV} />;
}

export const WithInteraction: Story = {
  render: () => <InteractionDemo />,
};

export const Edge: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, maxWidth: 320 }}>
      <TextField label="Empty label-less" />
      <TextField label="חתום כאן" placeholder="טקסט לדוגמה" />
      <TextField label="Very long placeholder" placeholder={'x '.repeat(80)} />
    </div>
  ),
};
