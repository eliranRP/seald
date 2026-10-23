import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScanCapture } from './ScanCapture';

const meta: Meta<typeof ScanCapture> = {
  title: 'L3/ScanCapture',
  component: ScanCapture,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
  args: { onComplete: async () => undefined, onClose: () => undefined },
};
export default meta;
type Story = StoryObj<typeof ScanCapture>;

/** Without a camera in the story iframe this lands on "Camera is blocked". */
export const Default: Story = {};

export const AllVariants: Story = {
  render: (args) => (
    <div style={{ height: 640 }}>
      <ScanCapture {...args} />
    </div>
  ),
};

export const Edge: Story = {
  args: { onClose: undefined },
};
