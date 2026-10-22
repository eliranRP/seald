import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { SigningOrderSteps } from './SigningOrderSteps';

const meta: Meta<typeof SigningOrderSteps> = {
  title: 'L2/SigningOrderSteps',
  component: SigningOrderSteps,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
  decorators: [
    (Story) => {
      (
        globalThis as unknown as { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> }
      ).__SEALD_FEATURE_OVERRIDES__ = { signingOrder: true };
      return <Story />;
    },
  ],
  args: {
    deliveryMode: 'sequential',
    sent: true,
    signers: [
      {
        id: 'a',
        name: 'Ada Lovelace',
        step: 1,
        invited_at: 't',
        signed_at: 't',
        declined_at: null,
      },
      { id: 'b', name: 'Bo Chen', step: 2, invited_at: 't', signed_at: null, declined_at: null },
      { id: 'c', name: 'Cy Ito', step: 2, invited_at: 't', signed_at: 't', declined_at: null },
      {
        id: 'd',
        name: 'Di Okafor',
        step: 3,
        invited_at: null,
        signed_at: null,
        declined_at: null,
      },
    ],
  },
};
export default meta;
type Story = StoryObj<typeof SigningOrderSteps>;

export const InProgress: Story = {};

export const Draft: Story = { args: { sent: false } };

export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};
