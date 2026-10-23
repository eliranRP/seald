import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ExpirySelection } from 'shared';
import { SendOptionsDialog } from './SendOptionsDialog';

const meta: Meta<typeof SendOptionsDialog> = {
  title: 'L3/SendOptionsDialog',
  component: SendOptionsDialog,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof SendOptionsDialog>;

function Demo({ ordered = false }: { readonly ordered?: boolean }) {
  const [enabled, setEnabled] = useState(true);
  const [cadence, setCadence] = useState({ firstAfterDays: 3, intervalDays: 3, maxReminders: 7 });
  const [expiry, setExpiry] = useState<ExpirySelection>({ kind: 'days', days: 30 });
  return (
    <SendOptionsDialog
      open
      onClose={() => {}}
      onSend={() => {}}
      ordered={ordered}
      recipients={[
        { id: '1', name: 'Eliran Azulay', color: '#A78BFA' },
        { id: '2', name: 'Maya Raskin', color: '#F472B6' },
        { id: '3', name: 'Hannah Wills', color: '#7DD3FC' },
      ]}
      remindersEnabled={enabled}
      onRemindersEnabledChange={setEnabled}
      cadence={cadence}
      onCadenceChange={setCadence}
      expiry={expiry}
      onExpiryChange={setExpiry}
    />
  );
}

export const Defaults: Story = { render: () => <Demo /> };
export const InOrder: Story = { render: () => <Demo ordered /> };
