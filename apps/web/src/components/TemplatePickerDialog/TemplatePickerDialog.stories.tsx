import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { TemplatePickerDialog } from './TemplatePickerDialog';
import { SAMPLE_TEMPLATES } from '../../test/templateFixtures';
import type { TemplateSummary } from '@/features/templates';

const meta: Meta<typeof TemplatePickerDialog> = {
  title: 'L3/TemplatePickerDialog',
  component: TemplatePickerDialog,
  tags: ['autodocs', 'layer-3'],
};
export default meta;
type Story = StoryObj<typeof TemplatePickerDialog>;

function Demo({ templates }: { readonly templates: ReadonlyArray<TemplateSummary> }) {
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<TemplateSummary | null>(null);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open picker
      </button>
      {picked ? <pre style={{ marginTop: 12 }}>Picked: {picked.name}</pre> : null}
      <TemplatePickerDialog
        open={open}
        templates={templates}
        onPick={(t) => {
          setPicked(t);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export const Default: Story = {
  render: () => <Demo templates={SAMPLE_TEMPLATES} />,
};

export const Empty: Story = {
  render: () => <Demo templates={[]} />,
};

export const SingleTemplate: Story = {
  render: () => <Demo templates={SAMPLE_TEMPLATES.slice(0, 1)} />,
};
