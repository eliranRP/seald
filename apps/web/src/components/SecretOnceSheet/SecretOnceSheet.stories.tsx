import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { SecretOnceSheet } from './SecretOnceSheet';

const meta: Meta<typeof SecretOnceSheet> = {
  title: 'L2/SecretOnceSheet',
  component: SecretOnceSheet,
  tags: ['autodocs', 'layer-2'],
  parameters: { chromatic: { modes: chromaticViewportModes } },
  args: {
    secret: 'seald_live_exampleSecretShownOnce',
    onClose: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof SecretOnceSheet>;

export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};

export const Desktop: Story = {
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
};
