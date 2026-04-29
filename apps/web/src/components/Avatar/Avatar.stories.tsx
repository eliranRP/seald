import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from './Avatar';

const meta: Meta<typeof Avatar> = {
  title: 'L1/Avatar',
  component: Avatar,
  tags: ['autodocs', 'layer-1'],
  args: { name: 'Jamie Okonkwo', size: 32 },
};
export default meta;
type Story = StoryObj<typeof Avatar>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Avatar name="Jamie Okonkwo" size={24} />
      <Avatar name="Kai Mendez" size={32} />
      <Avatar name="Priya Natarajan" size={40} />
      <Avatar name="Ezra Lam" size={56} />
      <Avatar name="Jamie" imageUrl="https://i.pravatar.cc/100?img=12" />
    </div>
  ),
};

export const WithInteraction: Story = {
  render: () => <Avatar name="Interactive" />,
};

export const Edge: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <Avatar name="X" />
      <Avatar name="ישראלה כהן" />
      <Avatar name="Very Very Very Long Name Here" />
    </div>
  ),
};
