import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { DeclineSheet } from './DeclineSheet';

const meta: Meta<typeof DeclineSheet> = {
  title: 'L3/DeclineSheet',
  component: DeclineSheet,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: { open: true, senderName: 'Eliran', onClose: () => undefined, onConfirm: () => undefined },
};
export default meta;
type Story = StoryObj<typeof DeclineSheet>;

export const Default: Story = {};
export const Busy: Story = { args: { busy: true } };
