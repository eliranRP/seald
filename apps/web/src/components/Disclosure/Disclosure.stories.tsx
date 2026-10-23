import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { Disclosure } from './Disclosure';

const meta: Meta<typeof Disclosure> = {
  title: 'L1/Disclosure',
  component: Disclosure,
  tags: ['autodocs', 'layer-1'],
  parameters: { chromatic: { modes: chromaticViewportModes } },
  args: { label: 'Advanced', children: <p>Extra options sit here.</p> },
};
export default meta;
type Story = StoryObj<typeof Disclosure>;

export const Closed: Story = {};

export const WithAccessibleName: Story = {
  args: { ariaLabel: 'Advanced options' },
};
