import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReadinessChip } from './ReadinessChip';

const meta: Meta<typeof ReadinessChip> = {
  title: 'L1/ReadinessChip',
  component: ReadinessChip,
  tags: ['autodocs', 'layer-1'],
  args: { issues: 0 },
};
export default meta;
type Story = StoryObj<typeof ReadinessChip>;

export const Ready: Story = {};
export const OneIssue: Story = { args: { issues: 1 } };
export const ManyIssues: Story = { args: { issues: 3 } };
