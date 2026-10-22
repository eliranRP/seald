import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { NotYourTurn } from './NotYourTurn';

const meta: Meta<typeof NotYourTurn> = {
  title: 'L4/NotYourTurn',
  component: NotYourTurn,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof NotYourTurn>;

export const Default: Story = {};

export const WithRetry: Story = { args: { onRetry: () => undefined } };

export const Mobile: Story = {
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};
