import type { Meta, StoryObj } from '@storybook/react-vite';
import { SignatureLevelNote } from './SignatureLevelNote';

const meta: Meta<typeof SignatureLevelNote> = {
  title: 'L2/SignatureLevelNote',
  component: SignatureLevelNote,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded' },
};
export default meta;
type Story = StoryObj<typeof SignatureLevelNote>;

/** The signer-facing signature-level disclosure, at the component's natural width. */
export const Default: Story = {};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'iphonex' } },
  render: () => (
    // The viewport addon may not be configured in this Storybook; the wrapping
    // 375px div is a safety net so the mobile framing is visible regardless.
    <div style={{ width: 375, maxWidth: '100%' }}>
      <SignatureLevelNote />
    </div>
  ),
};

export const Desktop: Story = {
  parameters: { viewport: { defaultViewport: 'desktop1280' } },
  render: () => (
    <div style={{ width: 1280, maxWidth: '100%' }}>
      <SignatureLevelNote />
    </div>
  ),
};
