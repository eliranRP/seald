import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SignersStepCard } from './SignersStepCard';
import type { SignersStepSigner } from './SignersStepCard.types';
import type { AddSignerContact } from '../AddSignerDropdown/AddSignerDropdown.types';

const SAMPLE_CONTACTS: ReadonlyArray<AddSignerContact> = [
  { id: 'c1', name: 'Eliran Azulay', email: 'eliran@azulay.co', color: '#F472B6' },
  { id: 'c2', name: 'Nitsan Yanovitch', email: 'nitsan@yanov.co', color: '#7DD3FC' },
  { id: 'c3', name: 'Ana Torres', email: 'ana@farrow.law', color: '#10B981' },
  { id: 'c4', name: 'Meilin Chen', email: 'meilin@chen.co', color: '#F59E0B' },
];

const PALETTE = ['#F472B6', '#7DD3FC', '#FBBF24', '#A78BFA'] as const;

const meta: Meta<typeof SignersStepCard> = {
  title: 'L3/SignersStepCard',
  component: SignersStepCard,
  // Layer-3 page surface — Step 1 of the templates wizard. Use these
  // stories to visually verify the empty state, the populated list
  // (with ordinal chips), and the inline picker open state.
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof SignersStepCard>;

function Demo({
  initial = [],
  mode = 'using',
}: {
  readonly initial?: ReadonlyArray<SignersStepSigner>;
  readonly mode?: 'new' | 'using' | 'editing';
}) {
  const [signers, setSigners] = useState<ReadonlyArray<SignersStepSigner>>(initial);
  return (
    <SignersStepCard
      mode={mode}
      signers={signers}
      contacts={SAMPLE_CONTACTS}
      onPickContact={(c) => {
        setSigners((prev) => {
          const exists = prev.find((s) => s.email.toLowerCase() === c.email.toLowerCase());
          if (exists) {
            return prev.filter((s) => s.email.toLowerCase() !== c.email.toLowerCase());
          }
          return [
            ...prev,
            {
              id: `s-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
              contactId: c.id,
              name: c.name,
              email: c.email,
              color: c.color,
            },
          ];
        });
      }}
      onCreateGuest={(name, email) => {
        setSigners((prev) => {
          const colorIdx = prev.length % PALETTE.length;
          return [
            ...prev,
            {
              id: `s-${Date.now()}`,
              contactId: null,
              name: name || email.split('@')[0] || email,
              email,
              color: PALETTE[colorIdx]!,
            },
          ];
        });
      }}
      onRemoveSigner={(rowId) => setSigners((prev) => prev.filter((s) => s.id !== rowId))}
      onContinue={() => {}}
      onBack={() => {}}
    />
  );
}

export const Empty: Story = {
  // Empty state — dashed pill prompt to add at least one receiver.
  render: () => <Demo mode="using" />,
};

export const PopulatedUsing: Story = {
  // Populated state in 'using' mode — pre-filled signer roster, copy
  // reads "Pre-filled from last time. Adjust as needed."
  render: () => (
    <Demo
      mode="using"
      initial={[
        {
          id: 's1',
          contactId: 'c1',
          name: 'Eliran Azulay',
          email: 'eliran@azulay.co',
          color: '#F472B6',
        },
        {
          id: 's2',
          contactId: 'c2',
          name: 'Nitsan Yanovitch',
          email: 'nitsan@yanov.co',
          color: '#7DD3FC',
        },
      ]}
    />
  ),
};

export const NewTemplate: Story = {
  // 'new' mode — empty state, copy reads "Who will sign this?"
  render: () => <Demo mode="new" />,
};
