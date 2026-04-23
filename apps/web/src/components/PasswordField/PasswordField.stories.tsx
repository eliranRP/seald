import type { Meta, StoryObj } from '@storybook/react';
import { PasswordField } from './PasswordField';

const meta: Meta<typeof PasswordField> = {
  title: 'L2/PasswordField',
  component: PasswordField,
  tags: ['autodocs', 'layer-2'],
  args: { label: 'Password', placeholder: 'Enter your password' },
};
export default meta;
type Story = StoryObj<typeof PasswordField>;

export const Default: Story = {};

export const WithForgotLink: Story = {
  args: {
    label: 'Password',
    labelRight: (
      <button
        type="button"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          color: 'inherit',
          font: 'inherit',
          cursor: 'pointer',
        }}
      >
        Forgot?
      </button>
    ),
  },
};

export const WithError: Story = {
  args: {
    label: 'Password',
    error: 'Password is required',
  },
};

export const SignupVariant: Story = {
  args: {
    label: 'Password',
    helpText: 'At least 8 characters',
  },
};
