import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { SignBar } from './SignBar';

const meta: Meta<typeof SignBar> = {
  title: 'L3/SignBar',
  component: SignBar,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: {
    done: 1,
    total: 3,
    optionalLeft: 1,
    ready: false,
    onNext: () => undefined,
    onFinish: () => undefined,
  },
};
export default meta;
type Story = StoryObj<typeof SignBar>;

export const InProgress: Story = {};
export const Ready: Story = { args: { done: 3, ready: true } };
