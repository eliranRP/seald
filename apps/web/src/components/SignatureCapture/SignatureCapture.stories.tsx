import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SignatureCapture } from './SignatureCapture';

function InteractiveDemo({ kind }: { readonly kind: 'signature' | 'initials' }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ minHeight: 400 }}>
      <button type="button" onClick={() => setOpen(true)}>
        Open capture
      </button>
      <SignatureCapture
        open={open}
        kind={kind}
        defaultName="Maya Raskin"
        onCancel={() => setOpen(false)}
        onApply={() => setOpen(false)}
      />
    </div>
  );
}

const meta: Meta<typeof SignatureCapture> = {
  title: 'L2/SignatureCapture',
  component: SignatureCapture,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof SignatureCapture>;

export const Signature: Story = {
  render: () => <InteractiveDemo kind="signature" />,
};
export const Initials: Story = {
  render: () => <InteractiveDemo kind="initials" />,
};
