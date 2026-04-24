import type { Meta, StoryObj } from '@storybook/react';
import { ProgressBar } from './ProgressBar';

const meta: Meta<typeof ProgressBar> = {
  title: 'L1/ProgressBar',
  component: ProgressBar,
  tags: ['autodocs', 'layer-1'],
  args: { value: 2, max: 5, tone: 'indigo' },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ProgressBar>;

export const Default: Story = {
  args: { value: 2, max: 5 },
};

export const Complete: Story = {
  args: { value: 3, max: 3, tone: 'success' },
};

export const Empty: Story = {
  args: { value: 0, max: 5 },
};

export const Overflow: Story = {
  args: { value: 7, max: 5 },
};
