import type { Meta, StoryObj } from '@storybook/react';
import { GoogleButton } from './GoogleButton';

const meta: Meta<typeof GoogleButton> = {
  title: 'L1/GoogleButton',
  component: GoogleButton,
  tags: ['autodocs', 'layer-1'],
};
export default meta;
type Story = StoryObj<typeof GoogleButton>;

export const Default: Story = {
  args: { label: 'Continue with Google' },
};

export const SignUp: Story = {
  args: { label: 'Sign up with Google' },
};

export const Busy: Story = {
  args: { label: 'Continue with Google', busy: true },
};

export const Disabled: Story = {
  args: { label: 'Continue with Google', disabled: true },
};
