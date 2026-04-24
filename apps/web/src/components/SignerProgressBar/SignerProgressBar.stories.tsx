import type { Meta, StoryObj } from '@storybook/react';
import { SignerProgressBar } from './SignerProgressBar';

const meta: Meta<typeof SignerProgressBar> = {
  title: 'L2/SignerProgressBar',
  component: SignerProgressBar,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ width: 260 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SignerProgressBar>;

export const NoneSigned: Story = {
  args: {
    signers: [
      { id: '1', status: 'pending' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'pending' },
    ],
  },
};

export const PartlySigned: Story = {
  args: {
    signers: [
      { id: '1', status: 'signed' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'pending' },
    ],
  },
};

export const WithDeclined: Story = {
  args: {
    signers: [
      { id: '1', status: 'signed' },
      { id: '2', status: 'declined' },
      { id: '3', status: 'pending' },
    ],
  },
};

export const AllSigned: Story = {
  args: {
    signers: [
      { id: '1', status: 'signed' },
      { id: '2', status: 'signed' },
      { id: '3', status: 'signed' },
    ],
  },
};
