import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { RetentionNotice } from './RetentionNotice';

const meta: Meta<typeof RetentionNotice> = {
  title: 'L2/RetentionNotice',
  component: RetentionNotice,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
  args: { verifyPath: '/verify/A6F2-91D3' },
};
export default meta;
type Story = StoryObj<typeof RetentionNotice>;

/** Retention sentence plus the public verify link, as on the sent and done screens. */
export const WithVerifyPath: Story = {};

/** Sent screen: the path is set in the mono face. */
export const OnSentPage: Story = {
  args: { mono: true },
};

/** Retention sentence alone, when no envelope code is known yet. */
export const WithoutVerifyPath: Story = {
  render: () => <RetentionNotice />,
};

export const Mobile: Story = {
  render: (args) => (
    // The viewport addon may not be configured in this Storybook; the wrapping
    // 390px div is a safety net so the mobile framing is visible regardless.
    <div style={{ width: 390, maxWidth: '100%' }}>
      <RetentionNotice {...args} />
    </div>
  ),
};

export const Desktop: Story = {
  render: (args) => (
    <div style={{ width: 1440, maxWidth: '100%' }}>
      <RetentionNotice {...args} />
    </div>
  ),
};
