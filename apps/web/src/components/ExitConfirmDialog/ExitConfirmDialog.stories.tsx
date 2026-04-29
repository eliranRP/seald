import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ExitConfirmDialog } from './ExitConfirmDialog';

const meta: Meta<typeof ExitConfirmDialog> = {
  title: 'L3/ExitConfirmDialog',
  component: ExitConfirmDialog,
  tags: ['autodocs', 'layer-3'],
};
export default meta;
type Story = StoryObj<typeof ExitConfirmDialog>;

function Demo({
  title,
  description,
  confirmLabel,
  cancelLabel,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <ExitConfirmDialog
        open={open}
        {...(title !== undefined ? { title } : {})}
        {...(description !== undefined ? { description } : {})}
        {...(confirmLabel !== undefined ? { confirmLabel } : {})}
        {...(cancelLabel !== undefined ? { cancelLabel } : {})}
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

export const Default: Story = {
  render: () => <Demo />,
};

export const CustomCopy: Story = {
  render: () => (
    <Demo
      title="Remove this signer?"
      description="They will still appear on documents where they were already placed, but you won't see them in this list anymore."
      confirmLabel="Remove"
      cancelLabel="Keep"
    />
  ),
};
