import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SaveAsTemplateDialog } from './SaveAsTemplateDialog';
import type { SaveAsTemplatePayload } from './SaveAsTemplateDialog.types';

const meta: Meta<typeof SaveAsTemplateDialog> = {
  title: 'L3/SaveAsTemplateDialog',
  component: SaveAsTemplateDialog,
  tags: ['autodocs', 'layer-3'],
};
export default meta;
type Story = StoryObj<typeof SaveAsTemplateDialog>;

function Demo({ defaultTitle }: { readonly defaultTitle?: string }) {
  const [open, setOpen] = useState(true);
  const [last, setLast] = useState<SaveAsTemplatePayload | null>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {last ? <pre style={{ marginTop: 12 }}>{JSON.stringify(last, null, 2)}</pre> : null}
      <SaveAsTemplateDialog
        open={open}
        {...(defaultTitle !== undefined ? { defaultTitle } : {})}
        onSave={(p) => {
          setLast(p);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

export const Default: Story = {
  render: () => <Demo />,
};

export const PrefilledFromEnvelope: Story = {
  render: () => <Demo defaultTitle="Mutual NDA — short form" />,
};
