import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { SignatureLevelNote } from './SignatureLevelNote';

const meta: Meta<typeof SignatureLevelNote> = {
  title: 'L2/SignatureLevelNote',
  component: SignatureLevelNote,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof SignatureLevelNote>;

/** The signer-facing signature-level disclosure, at the component's natural width. */
export const Default: Story = {};

export const Mobile: Story = {
  render: () => (
    // preview.tsx defines no viewports, so the 390px wrapper is the local frame.
    // Chromatic still uses the modes on the meta.
    <div style={{ width: 390, maxWidth: '100%' }}>
      <SignatureLevelNote />
    </div>
  ),
};

export const Desktop: Story = {
  render: () => (
    // Same reason as Mobile: a width wrapper, not a viewport addon.
    <div style={{ width: 1440, maxWidth: '100%' }}>
      <SignatureLevelNote />
    </div>
  ),
};
