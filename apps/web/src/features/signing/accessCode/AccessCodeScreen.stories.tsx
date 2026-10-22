import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { AccessCodeScreen } from './AccessCodeScreen';

const meta: Meta<typeof AccessCodeScreen> = {
  title: 'L4/AccessCodeScreen',
  component: AccessCodeScreen,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: {
    emailMasked: 'j***@example.com',
    onVerified: () => undefined,
    sendCode: () =>
      Promise.resolve({
        status: 'sent',
        purpose: 'access',
        email_masked: 'j***@example.com',
        expires_in_seconds: 600,
        resend_after_seconds: 60,
      }),
  },
};
export default meta;
type Story = StoryObj<typeof AccessCodeScreen>;

export const Default: Story = {};

export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};
