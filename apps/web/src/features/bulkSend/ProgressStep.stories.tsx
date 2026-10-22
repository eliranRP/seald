import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { fakeBatch, fakeFinishedWithFailure, fakeProcessing, fakeRow } from './fixtures';
import { ProgressStep } from './ProgressStep';

function noop(): void {
  /* story stub */
}

const meta: Meta<typeof ProgressStep> = {
  title: 'L3/BulkSend/ProgressStep',
  component: ProgressStep,
  tags: ['autodocs', 'layer-3'],
  parameters: {
    layout: 'padded',
    chromatic: { modes: chromaticViewportModes },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
  args: {
    batch: fakeProcessing(),
    canceling: false,
    error: null,
    onCancel: noop,
    backTo: '/templates',
  },
};
export default meta;
type Story = StoryObj<typeof ProgressStep>;

export const Sending: Story = {};

export const Canceling: Story = { args: { canceling: true } };

export const FinishedWithFailure: Story = { args: { batch: fakeFinishedWithFailure() } };

export const FinishedAllSent: Story = {
  args: {
    batch: fakeBatch({
      status: 'completed',
      confirmable: false,
      rows: [
        fakeRow(1, { status: 'sent', envelope_id: '00000000-0000-4000-8000-000000000e01' }),
        fakeRow(2, { status: 'sent', envelope_id: '00000000-0000-4000-8000-000000000e02' }),
      ],
    }),
  },
};

export const Canceled: Story = {
  args: {
    batch: fakeBatch({
      status: 'canceled',
      confirmable: false,
      rows: [
        fakeRow(1, { status: 'sent', envelope_id: '00000000-0000-4000-8000-000000000e01' }),
        fakeRow(2, { status: 'canceled' }),
        fakeRow(3, { status: 'canceled' }),
      ],
    }),
  },
};

export const CancelFailed: Story = {
  args: { error: 'Something went wrong. Try again.' },
};
