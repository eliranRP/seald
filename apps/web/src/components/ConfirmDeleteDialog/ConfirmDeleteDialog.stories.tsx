import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';

const meta: Meta<typeof ConfirmDeleteDialog> = {
  title: 'L1/ConfirmDeleteDialog',
  component: ConfirmDeleteDialog,
  tags: ['autodocs', 'layer-1'],
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    title: 'Delete NDA — standard?',
    note: 'Sent documents stay.',
    onConfirm: () => undefined,
    onCancel: () => undefined,
  },
};
export default meta;
type Story = StoryObj<typeof ConfirmDeleteDialog>;

export const Template: Story = {};

export const Contacts: Story = {
  args: {
    title: 'Delete 3 contacts?',
    note: 'They stay on sent documents.',
    deleteLabel: 'Delete',
  },
};
