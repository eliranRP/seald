import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { SendConfirmDialog } from './SendConfirmDialog';

const meta: Meta<typeof SendConfirmDialog> = {
  title: 'L3/SendConfirmDialog',
  component: SendConfirmDialog,
  // Confirms the "update template too?" choice when the sender clicks
  // Send while operating on a saved template. Two stacked tiles: send
  // and update (recommended, indigo) vs just send (neutral).
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof SendConfirmDialog>;

function Demo() {
  const [open, setOpen] = useState(true);
  const [outcome, setOutcome] = useState<string>('');
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <p style={{ marginTop: 12, fontSize: 13 }}>
        {outcome ? `Last action: ${outcome}` : '\u00A0'}
      </p>
      <SendConfirmDialog
        open={open}
        onSendAndUpdate={() => {
          setOutcome('send + update template');
          setOpen(false);
        }}
        onJustSend={() => {
          setOutcome('just send');
          setOpen(false);
        }}
        onCancel={() => {
          setOutcome('cancelled');
          setOpen(false);
        }}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <Demo />,
};
