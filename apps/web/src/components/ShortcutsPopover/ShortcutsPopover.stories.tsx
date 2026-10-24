import type { Meta, StoryObj } from '@storybook/react-vite';
import { ShortcutsPopover } from './ShortcutsPopover';

const meta: Meta<typeof ShortcutsPopover> = {
  title: 'L2/ShortcutsPopover',
  component: ShortcutsPopover,
  tags: ['autodocs', 'layer-2'],
  args: { open: true, onClose: () => {} },
};
export default meta;
type Story = StoryObj<typeof ShortcutsPopover>;

export const Open: Story = {};
