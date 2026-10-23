import type { Meta, StoryObj } from '@storybook/react-vite';
import { HeaderBell } from './HeaderBell';

const meta: Meta<typeof HeaderBell> = {
  title: 'L2/HeaderBell',
  component: HeaderBell,
  tags: ['autodocs', 'layer-2'],
  args: { count: 0, onClick: () => undefined },
};
export default meta;
type Story = StoryObj<typeof HeaderBell>;

export const Empty: Story = {};

export const Pending: Story = { args: { count: 3 } };

export const Overflow: Story = { args: { count: 142 } };
