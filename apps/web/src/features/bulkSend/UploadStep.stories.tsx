import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { fakeSchema } from './fixtures';
import { UploadStep } from './UploadStep';

function noop(): void {
  /* story stub */
}

const meta: Meta<typeof UploadStep> = {
  title: 'L3/BulkSend/UploadStep',
  component: UploadStep,
  tags: ['autodocs', 'layer-3'],
  parameters: {
    layout: 'padded',
    chromatic: { modes: chromaticViewportModes },
  },
  args: { schema: fakeSchema(), busy: false, error: null, onSubmit: noop },
};
export default meta;
type Story = StoryObj<typeof UploadStep>;

export const Default: Story = {};

export const OneSigner: Story = {
  args: {
    schema: fakeSchema({
      slots: [
        {
          slot: 1,
          label: 'Signer 1',
          name_column: 'recipient_1_name',
          email_column: 'recipient_1_email',
        },
      ],
    }),
  },
};

export const Uploading: Story = { args: { busy: true } };

export const Rejected: Story = {
  args: { error: 'The file has too many rows. Split it into smaller files of 100 rows or fewer.' },
};
