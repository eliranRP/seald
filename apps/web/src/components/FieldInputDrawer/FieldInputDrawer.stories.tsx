import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FieldInputDrawer } from './FieldInputDrawer';
import type { FieldInputKind } from './FieldInputDrawer.types';

function Demo({ kind, label }: { readonly kind: FieldInputKind; readonly label: string }) {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState('');
  return (
    <div style={{ minHeight: 400 }}>
      <button type="button" onClick={() => setOpen(true)}>
        Open {label}
      </button>
      {value ? <div>Last applied: {value}</div> : null}
      <FieldInputDrawer
        open={open}
        kind={kind}
        label={label}
        onCancel={() => setOpen(false)}
        onApply={(v) => {
          setValue(v);
          setOpen(false);
        }}
      />
    </div>
  );
}

const meta: Meta<typeof FieldInputDrawer> = {
  title: 'L2/FieldInputDrawer',
  component: FieldInputDrawer,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof FieldInputDrawer>;

export const Text: Story = { render: () => <Demo kind="text" label="Job title" /> };
export const Email: Story = { render: () => <Demo kind="email" label="Work email" /> };
export const DateField: Story = { render: () => <Demo kind="date" label="Date" /> };
export const NameField: Story = { render: () => <Demo kind="name" label="Full name" /> };
