import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { SenderProgressNote } from './SenderProgressNote';

const meta: Meta<typeof SenderProgressNote> = {
  title: 'L2/SenderProgressNote',
  component: SenderProgressNote,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof SenderProgressNote>;

/** How the sent-confirmation body renders the note: a paragraph of body copy. */
export const InParagraph: Story = {
  render: () => (
    <p style={{ maxWidth: 560, margin: 0, lineHeight: 1.5 }}>
      <SenderProgressNote />
    </p>
  ),
};

/** The note with no surrounding paragraph, for reuse in other layouts. */
export const Standalone: Story = {};

export const Mobile: Story = {
  render: () => (
    // preview.tsx defines no viewports, so the 390px wrapper is the local frame.
    // Chromatic still uses the modes on the meta.
    <div style={{ width: 390, maxWidth: '100%' }}>
      <p style={{ margin: 0, lineHeight: 1.5 }}>
        <SenderProgressNote />
      </p>
    </div>
  ),
};

export const Desktop: Story = {
  render: () => (
    // Same reason as Mobile: a width wrapper, not a viewport addon.
    <div style={{ width: 1440, maxWidth: '100%' }}>
      <p style={{ margin: 0, lineHeight: 1.5 }}>
        <SenderProgressNote />
      </p>
    </div>
  ),
};
