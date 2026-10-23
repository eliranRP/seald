import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pen } from 'lucide-react';
import { SplitButton } from './SplitButton';

const meta: Meta<typeof SplitButton> = {
  title: 'L2/SplitButton',
  component: SplitButton,
  tags: ['autodocs', 'layer-2'],
  args: { label: 'Send', onMain: () => {}, onOptions: () => {} },
};
export default meta;
type Story = StoryObj<typeof SplitButton>;

export const Default: Story = {};
export const SignNow: Story = { args: { label: 'Sign now', icon: Pen } };
export const Disabled: Story = { args: { disabled: true } };
export const FullWidth: Story = { args: { fullWidth: true } };
