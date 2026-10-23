import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionExpiredDialog } from './SessionExpiredDialog';

const meta: Meta<typeof SessionExpiredDialog> = {
  title: 'L3/SessionExpiredDialog',
  component: SessionExpiredDialog,
  tags: ['autodocs', 'layer-3'],
  args: { open: true, onSignIn: () => undefined },
};
export default meta;
type Story = StoryObj<typeof SessionExpiredDialog>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: (args) => <SessionExpiredDialog {...args} mobile />,
};

export const Edge: Story = {
  args: { open: false },
};
