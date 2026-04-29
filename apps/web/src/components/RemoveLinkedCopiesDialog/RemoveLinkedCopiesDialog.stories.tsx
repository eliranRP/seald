import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { RemoveLinkedCopiesDialog } from './RemoveLinkedCopiesDialog';
import type { RemoveLinkedScope } from './RemoveLinkedCopiesDialog.types';

const meta: Meta<typeof RemoveLinkedCopiesDialog> = {
  title: 'L2/RemoveLinkedCopiesDialog',
  component: RemoveLinkedCopiesDialog,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    linkedCount: 3,
    onConfirm: () => {},
    onCancel: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof RemoveLinkedCopiesDialog>;

export const Default: Story = {
  args: { open: true, linkedCount: 3 },
};

/** Singular case — the pluralized "All pages (N)" helper collapses to "All pages". */
export const SingleCopy: Story = {
  args: { open: true, linkedCount: 1 },
};

export const WithManyCopies: Story = {
  args: { open: true, linkedCount: 12 },
};

function PlaygroundDialog() {
  const [open, setOpen] = useState(true);
  const [lastScope, setLastScope] = useState<RemoveLinkedScope | null>(null);

  return (
    <div
      style={{
        minHeight: 400,
        padding: 24,
        fontFamily: 'var(--font-sans, system-ui)',
        color: 'var(--fg-1, #111827)',
      }}
    >
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setLastScope(null);
        }}
        style={{
          padding: '8px 14px',
          borderRadius: 6,
          border: '1px solid #CBD5E1',
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        Reopen dialog
      </button>
      <div style={{ marginTop: 16, fontSize: 13 }}>
        Last confirmed scope: <strong>{lastScope ?? '(none — try clicking Remove)'}</strong>
      </div>
      <RemoveLinkedCopiesDialog
        open={open}
        linkedCount={4}
        onConfirm={(scope) => {
          setLastScope(scope);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}

export const Playground: Story = {
  render: () => <PlaygroundDialog />,
};
