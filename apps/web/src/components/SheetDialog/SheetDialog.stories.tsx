import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/Button';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { SheetDialog } from './SheetDialog';

const meta: Meta<typeof SheetDialog> = {
  title: 'L2/SheetDialog',
  component: SheetDialog,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: {
    open: true,
    title: 'Your signature',
    onClose: () => undefined,
    children: 'Modal on a desktop, bottom sheet on a phone.',
    footer: <Button>Sign</Button>,
  },
};
export default meta;
type Story = StoryObj<typeof SheetDialog>;

export const Default: Story = {};
