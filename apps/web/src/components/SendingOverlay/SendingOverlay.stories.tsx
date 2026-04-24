import type { Meta, StoryObj } from '@storybook/react';
import { SendingOverlay } from './SendingOverlay';
import type { SendingOverlaySigner } from './SendingOverlay.types';

const signers: ReadonlyArray<SendingOverlaySigner> = [
  { id: '1', name: 'Maya Raskin', email: 'maya@northwind.co', color: '#4F46E5' },
  { id: '2', name: 'Jonah Park', email: 'jonah@quill.vc', color: '#F59E0B' },
  { id: '3', name: 'Ada Lovelace', email: 'ada@example.com', color: '#10B981' },
];

const meta: Meta<typeof SendingOverlay> = {
  title: 'L3/SendingOverlay',
  component: SendingOverlay,
  tags: ['autodocs'],
  parameters: {
    // The overlay is full-viewport by design, so don't center the canvas.
    layout: 'fullscreen',
  },
  args: {
    open: true,
    signers,
    fieldCount: 5,
    envelopeCode: 'DOC-8F3A-4291',
    error: null,
    onCancel: () => {},
    onViewEnvelope: () => {},
    onRetry: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof SendingOverlay>;

export const Creating: Story = {
  args: { phase: 'creating' },
};

export const Uploading: Story = {
  args: { phase: 'uploading' },
};

export const AddingSigners: Story = {
  args: { phase: 'adding-signers' },
};

export const PlacingFields: Story = {
  args: { phase: 'placing-fields' },
};

export const Sending: Story = {
  args: { phase: 'sending' },
};

export const Done: Story = {
  args: { phase: 'done' },
};

export const ErrorState: Story = {
  args: {
    phase: 'error',
    error: 'Upload failed: the file could not be sealed. Check your network and try again.',
  },
};

export const SingleSigner: Story = {
  args: {
    phase: 'sending',
    signers: [signers[0]!],
    fieldCount: 2,
  },
};

export const ManySigners: Story = {
  args: {
    phase: 'adding-signers',
    signers: [
      ...signers,
      { id: '4', name: 'Bob Byte', email: 'bob@example.com' },
      { id: '5', name: 'Cara Crane', email: 'cara@example.com' },
      { id: '6', name: 'Dan Day', email: 'dan@example.com' },
    ],
    fieldCount: 12,
  },
};

export const Closed: Story = {
  args: { phase: 'idle', open: false },
  parameters: {
    docs: {
      description: {
        story: 'When `open` is false the overlay renders nothing — used while the send is idle.',
      },
    },
  },
};
