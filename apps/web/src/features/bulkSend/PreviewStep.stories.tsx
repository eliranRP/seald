import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { fakeBatch, fakePreviewWithProblems, fakeRow } from './fixtures';
import { PreviewStep } from './PreviewStep';

function noop(): void {
  /* story stub */
}

const meta: Meta<typeof PreviewStep> = {
  title: 'L3/BulkSend/PreviewStep',
  component: PreviewStep,
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
    batch: fakeBatch(),
    confirming: false,
    error: null,
    onConfirm: noop,
    onStartOver: noop,
  },
};
export default meta;
type Story = StoryObj<typeof PreviewStep>;

export const AllValid: Story = {};

export const WithProblems: Story = { args: { batch: fakePreviewWithProblems() } };

export const MissingColumn: Story = {
  args: {
    batch: fakeBatch({
      rows: [
        fakeRow(1, {
          status: 'invalid',
          errors: [
            {
              code: 'missing_column',
              column: 'recipient_2_email',
              message: 'The file has no "recipient_2_email" column (Tenant).',
            },
          ],
        }),
      ],
      column_errors: [
        {
          code: 'missing_column',
          column: 'recipient_2_email',
          message: 'The file has no "recipient_2_email" column (Tenant).',
        },
      ],
      ignored_columns: ['notes'],
    }),
  },
};

export const Confirming: Story = { args: { confirming: true } };

export const ConfirmFailed: Story = {
  args: { error: 'This preview expired. Upload the file again.' },
};
