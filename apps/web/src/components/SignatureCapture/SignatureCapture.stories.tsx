import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
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
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof SignatureCapture>;

export const Signature: Story = {
  render: () => <InteractiveDemo kind="signature" />,
};
export const Initials: Story = {
  render: () => <InteractiveDemo kind="initials" />,
};

/** Open signature sheet at 390×844. Footer says when the audit trail records the signature. */
export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
  render: () => <InteractiveDemo kind="signature" />,
};

/** Open signature sheet at 1440×900. Footer says when the audit trail records the signature. */
export const Desktop: Story = {
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
  render: () => <InteractiveDemo kind="signature" />,
};
