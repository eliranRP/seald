import type { Meta, StoryObj } from '@storybook/react-vite';
import { RetentionNotice } from './RetentionNotice';

const meta: Meta<typeof RetentionNotice> = {
  title: 'L2/RetentionNotice',
  component: RetentionNotice,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded' },
  args: { verifyPath: '/verify/A6F2-91D3' },
};
export default meta;
type Story = StoryObj<typeof RetentionNotice>;

/** Retention sentence plus the public verify link, as on the sent and done screens. */
export const WithVerifyPath: Story = {};

/** Retention sentence alone, when no envelope code is known yet. */
export const WithoutVerifyPath: Story = {
  render: () => <RetentionNotice />,
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'iphonex' } },
  render: (args) => (
    // The viewport addon may not be configured in this Storybook; the wrapping
    // 375px div is a safety net so the mobile framing is visible regardless.
    <div style={{ width: 375, maxWidth: '100%' }}>
      <RetentionNotice {...args} />
    </div>
  ),
};

export const Desktop: Story = {
  parameters: { viewport: { defaultViewport: 'desktop1280' } },
  render: (args) => (
    <div style={{ width: 1280, maxWidth: '100%' }}>
      <RetentionNotice {...args} />
    </div>
  ),
};
