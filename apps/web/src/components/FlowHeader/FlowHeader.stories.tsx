import type { Meta, StoryObj } from '@storybook/react-vite';
import { FlowHeader } from './FlowHeader';

const meta: Meta<typeof FlowHeader> = {
  title: 'L2/FlowHeader',
  component: FlowHeader,
  tags: ['autodocs', 'layer-2'],
  args: {
    title: 'Master services agreement',
    meta: '8 pages',
    onClose: () => {},
    steps: [
      { label: 'Upload', state: 'done' },
      { label: 'Prepare', state: 'active' },
      { label: 'Send', state: 'todo' },
    ],
  },
};
export default meta;
type Story = StoryObj<typeof FlowHeader>;

export const Prepare: Story = {};

export const Upload: Story = {
  args: {
    title: undefined,
    meta: undefined,
    steps: [
      { label: 'Upload', state: 'active' },
      { label: 'Prepare', state: 'todo' },
      { label: 'Send', state: 'todo' },
    ],
  },
};
