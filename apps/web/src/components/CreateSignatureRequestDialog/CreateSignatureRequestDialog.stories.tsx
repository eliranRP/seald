import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import type { JSX } from 'react';
import { CreateSignatureRequestDialog } from './CreateSignatureRequestDialog';
import type { CreateSignatureRequestDialogSigner } from './CreateSignatureRequestDialog.types';
import type { AddSignerContact } from '../AddSignerDropdown';
import { Button } from '../Button';
import { seald } from '../../styles/theme';

const CONTACTS: ReadonlyArray<AddSignerContact> = [
  { id: 'c1', name: 'Eliran Azulay', email: 'eliran@azulay.co', color: seald.color.indigo[500] },
  { id: 'c2', name: 'Nitsan Yanovitch', email: 'nitsan@yanov.co', color: seald.color.success[500] },
  { id: 'c3', name: 'Ana Torres', email: 'ana@farrow.law', color: seald.color.warn[500] },
  { id: 'c4', name: 'Meilin Chen', email: 'meilin@chen.co', color: seald.color.info[500] },
];

const meta: Meta<typeof CreateSignatureRequestDialog> = {
  title: 'L3/CreateSignatureRequestDialog',
  component: CreateSignatureRequestDialog,
  tags: ['autodocs', 'layer-3'],
};
export default meta;
type Story = StoryObj<typeof CreateSignatureRequestDialog>;

const SIGNER_PALETTE = [
  seald.color.indigo[500],
  seald.color.success[500],
  seald.color.warn[500],
  seald.color.info[500],
] as const;

function Demo(args: { readonly initialOpen: boolean }): JSX.Element {
  const { initialOpen } = args;
  const [open, setOpen] = useState(initialOpen);
  const [signers, setSigners] = useState<ReadonlyArray<CreateSignatureRequestDialogSigner>>([]);

  return (
    <div style={{ padding: 24, fontFamily: seald.font.sans }}>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <div style={{ marginTop: 12, color: seald.color.fg[2] }}>Receivers: {signers.length}</div>
      <CreateSignatureRequestDialog
        open={open}
        signers={signers}
        contacts={CONTACTS}
        onAddFromContact={(c) =>
          setSigners((prev) =>
            prev.some((s) => s.id === c.id)
              ? prev
              : [...prev, { id: c.id, name: c.name, email: c.email, color: c.color }],
          )
        }
        onCreateContact={(name, email) =>
          setSigners((prev) => {
            const color = SIGNER_PALETTE[prev.length % SIGNER_PALETTE.length] ?? SIGNER_PALETTE[0];
            return [...prev, { id: `s_${String(prev.length + 1)}`, name, email, color }];
          })
        }
        onRemoveSigner={(id) => setSigners((prev) => prev.filter((s) => s.id !== id))}
        onApply={() => setOpen(false)}
        onCancel={() => {
          setSigners([]);
          setOpen(false);
        }}
      />
    </div>
  );
}

export const Closed: Story = {
  render: () => <Demo initialOpen={false} />,
};

export const Open: Story = {
  render: () => <Demo initialOpen />,
};
