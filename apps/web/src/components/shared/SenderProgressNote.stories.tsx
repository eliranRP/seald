import type { Meta, StoryObj } from '@storybook/react-vite';
import { SenderProgressNote } from './SenderProgressNote';

const meta: Meta<typeof SenderProgressNote> = {
  title: 'L2/SenderProgressNote',
  component: SenderProgressNote,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded' },
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
  parameters: { viewport: { defaultViewport: 'iphonex' } },
  render: () => (
    // The viewport addon may not be configured in this Storybook; the wrapping
    // 375px div is a safety net so the mobile framing is visible regardless.
    <div style={{ width: 375, maxWidth: '100%' }}>
      <p style={{ margin: 0, lineHeight: 1.5 }}>
        <SenderProgressNote />
      </p>
    </div>
  ),
};

export const Desktop: Story = {
  parameters: { viewport: { defaultViewport: 'desktop1280' } },
  render: () => (
    <div style={{ width: 1280, maxWidth: '100%' }}>
      <p style={{ margin: 0, lineHeight: 1.5 }}>
        <SenderProgressNote />
      </p>
    </div>
  ),
};
