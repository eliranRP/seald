import type { Meta, StoryObj } from '@storybook/react-vite';
import { SignerStack } from './SignerStack';

const meta: Meta<typeof SignerStack> = {
  title: 'L2/SignerStack',
  component: SignerStack,
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof SignerStack>;

export const Default: Story = {
  args: {
    signers: [
      { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', status: 'signed' },
      { id: '2', name: 'Bob Byte', email: 'bob@example.com', status: 'pending' },
    ],
  },
};

export const Many: Story = {
  args: {
    signers: [
      { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', status: 'signed' },
      { id: '2', name: 'Bob Byte', email: 'bob@example.com', status: 'signed' },
      { id: '3', name: 'Cara Crane', email: 'cara@example.com', status: 'pending' },
      { id: '4', name: 'Dan Day', email: 'dan@example.com', status: 'pending' },
      { id: '5', name: 'Eli Esk', email: 'eli@example.com', status: 'pending' },
      { id: '6', name: 'Fay Fox', email: 'fay@example.com', status: 'pending' },
      { id: '7', name: 'Gus Gold', email: 'gus@example.com', status: 'pending' },
    ],
  },
};

export const Declined: Story = {
  args: {
    signers: [
      { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', status: 'signed' },
      { id: '2', name: 'Bob Byte', email: 'bob@example.com', status: 'declined' },
      { id: '3', name: 'Cara Crane', email: 'cara@example.com', status: 'pending' },
    ],
  },
};

export const AllSigned: Story = {
  args: {
    signers: [
      { id: '1', name: 'Ada Lovelace', email: 'ada@example.com', status: 'signed' },
      { id: '2', name: 'Bob Byte', email: 'bob@example.com', status: 'signed' },
      { id: '3', name: 'Cara Crane', email: 'cara@example.com', status: 'signed' },
    ],
  },
};
